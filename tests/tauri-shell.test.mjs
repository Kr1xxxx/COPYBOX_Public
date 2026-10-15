import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const conf = () => JSON.parse(read("src-tauri/tauri.conf.json"));

test("the app version has one source: package.json (Tauri reads it, Cargo must match)", () => {
  const version = JSON.parse(read("package.json")).version;
  assert.equal(conf().version, "../package.json");
  assert.match(read("src-tauri/Cargo.toml"), new RegExp(`^version = "${version.replaceAll(".", "\\.")}"$`, "m"));
});

test("the page may only load its own files; network access goes through Rust commands", () => {
  const csp = conf().app.security.csp;
  assert.equal(typeof csp, "string");
  const directive = (name) => (csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) || "").split(/\s+/).slice(1);
  assert.deepEqual(directive("script-src"), ["'self'"]);
  assert.deepEqual(directive("default-src"), ["'self'"]);
  assert.deepEqual(directive("object-src"), ["'none'"]);
  assert.ok(!/unsafe-eval/.test(csp));
  assert.ok(!directive("connect-src").some((source) => /^https?:\/\/(?!ipc\.localhost)/.test(source) || source === "*"));
});

test("the Tauri bridge offers every method the page expects from window.clipboxDesktop", () => {
  const type = read("app/desktop-bridge.ts").match(/export type ClipboxDesktop = \{([\s\S]*?)\n\};/)[1];
  const wanted = [...type.matchAll(/^\s{2}(\w+)\??:/gm)].map((match) => match[1])// platform, testTools and cloudDemo are plain values, not methods; the real bridge never sets testTools or cloudDemo (web preview only).
    .filter((name) => name !== "platform" && name !== "testTools" && name !== "cloudDemo");
  assert.ok(wanted.length > 20);
  const bridge = read("src-tauri/bridge.js");
  const missing = wanted.filter((name) => !new RegExp(`^\\s{4}${name}: function`, "m").test(bridge));
  assert.deepEqual(missing, []);
});

test("every command the bridge calls is registered in Rust", () => {
  const called = [...read("src-tauri/bridge.js").matchAll(/(?:invoke|fireAndForget)\("(\w+)"/g)].map((match) => match[1]);
  const main = read("src-tauri/src/main.rs");
  const registered = new Set([...main.slice(main.indexOf("generate_handler!")).matchAll(/(\w+),/g)].map((match) => match[1]));
  const missing = [...new Set(called)].filter((name) => !registered.has(name));
  assert.deepEqual(missing, []);
});

test("errors from Rust reach the page as Error objects", () => {
  assert.match(read("src-tauri/bridge.js"), /throw error instanceof Error \? error : new Error\(String\(error\)\)/);
});

test("sleep, lock and shutdown ask the page to save (Windows hook is wired in)", () => {
  assert.match(read("src-tauri/src/main.rs"), /power::watch_window\(/);
  assert.match(read("src-tauri/src/power.rs"), /WM_POWERBROADCAST[\s\S]*WM_WTSSESSION_CHANGE[\s\S]*WM_QUERYENDSESSION|WM_QUERYENDSESSION[\s\S]*WM_POWERBROADCAST/);
  assert.match(read("src-tauri/Cargo.toml"), /^windows = /m);
});

test("「关闭即退出」 keeps the window until the page has saved: it hides it and quits like the tray's 退出", () => {
  const shell = read("src-tauri/src/shell.rs");
  const arm = shell.slice(shell.indexOf("pub fn on_close_requested")).match(/CloseAction::Quit => \{([\s\S]*?)\n {12}\}/)[1];
  // Letting the close go ahead destroys the window, and flush.rs cannot ask a page that is gone to save.
  assert.doesNotMatch(arm, /\btrue\s*$/);
  assert.match(arm, /window\.hide\(\)/);
  assert.match(arm, /self\.quit\(/);
  assert.match(arm, /\bfalse\s*$/);
  // Only once a quit is under way (the page was already asked to save) may the window close as before.
  assert.match(shell, /CloseAction::Quit if quitting => true,/);
  // quit() ends in app.exit, whose exit request is held back until the page answered (or 1.5 s passed).
  assert.match(shell.slice(shell.indexOf("pub fn quit"), shell.indexOf("pub fn on_close_requested")), /app\.exit\(0\)/);
  assert.match(read("src-tauri/src/main.rs"), /RunEvent::ExitRequested[\s\S]*?api\.prevent_exit\(\);\s*flush::then_after_flush\(app, \|app\| app\.exit\(0\)\)/);
  assert.match(read("src-tauri/src/flush.rs"), /const TIMEOUT: Duration = Duration::from_millis\(1500\);/);
});

test("compressImage hands the bytes and the key to the shell and turns a failure into a reason word", async () => {
  const vm = await import("node:vm");
  const run = async (invokeImpl) => {
    const calls = [];
    const window = { addEventListener() {} };
    const tauri = { core: { invoke: (name, args, options) => { calls.push({ name, args, options }); return invokeImpl(); } }, clipboardManager: {}, app: {}, event: {} };
    window.__TAURI__ = tauri;
    vm.runInNewContext(read("src-tauri/bridge.js").replace("__PLATFORM__", "win32"), { window, Uint8Array, Error, String, Boolean, setTimeout, clearTimeout, document: { documentElement: { classList: { add() {}, remove() {} } }, hidden: false, hasFocus: () => true, addEventListener() {} }, addEventListener() {} });
    const result = await window.clipboxDesktop.compressImage(new Uint8Array([1, 2]), "KEY");
    return { result, calls };
  };
  const ok = await run(async () => new Uint8Array([9]).buffer);
  assert.equal(ok.calls[0].name, "compress_image");
  assert.equal(ok.calls[0].options.headers["x-tinify-key"], "KEY");
  assert.deepEqual(Array.from(ok.result.bytes), [9]);
  assert.equal(ok.result.ok, true);
  const failed = await run(async () => { throw "limit"; });
  assert.equal(failed.result.ok, false);
  assert.equal(failed.result.reason, "limit");
});

test("no TinyPNG key is built into the installer: the shell only sends the key the person filled in (D-055)", () => {
  for (const file of ["src-tauri/src/tinify.rs", "src-tauri/src/main.rs", "src-tauri/bridge.js", ".github/workflows/tauri.yml", "app/image-compress.ts"]) {
    assert.doesNotMatch(read(file), /CLIPBOX_TINIFY_KEYS|tinify_builtin_count|compressBuiltInCount|builtin:/i, file);
  }
});

test("the top band moves the window: the bridge starts a drag and the capability allows it", () => {
  const bridge = read("src-tauri/bridge.js");
  assert.match(bridge, /plugin:window\|start_dragging/);
  assert.match(bridge, /closest\("\.drag-region"\)/);
  assert.match(read("src-tauri/capabilities/main.json"), /core:window:allow-start-dragging/);
});

test("the browser's page menu and its keys are blocked, but text fields keep their menu", async () => {
  const vm = await import("node:vm");
  const listeners = {};
  const window = { addEventListener(name, fn) { if (name === "DOMContentLoaded") fn(); } };
  window.__TAURI__ = { core: { invoke: async () => {} }, clipboardManager: {}, app: {}, event: {} };
  const document = {
    documentElement: { classList: { add() {}, remove() {} } },
    hidden: false,
    hasFocus: () => true,
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); if (name === "DOMContentLoaded") fn(); },
  };
  vm.runInNewContext(read("src-tauri/bridge.js").replace("__PLATFORM__", "win32"), { window, Uint8Array, Error, String, Boolean, setTimeout, clearTimeout, document, addEventListener() {} });
  const fire = (name, event) => { let prevented = false; for (const fn of listeners[name] || []) fn({ ...event, preventDefault() { prevented = true; } }); return prevented; };
  const onPage = { closest: () => null };
  const onField = { closest: (selector) => (/input/.test(selector) ? {} : null) };
  assert.equal(fire("contextmenu", { target: onPage }), true);
  assert.equal(fire("contextmenu", { target: onField }), false);
  assert.equal(fire("keydown", { key: "r", ctrlKey: true }), true);
  assert.equal(fire("keydown", { key: "p", ctrlKey: true }), true);
  assert.equal(fire("keydown", { key: "F5" }), true);
  assert.equal(fire("keydown", { key: "v", ctrlKey: true }), false);
  assert.equal(fire("keydown", { key: "c", ctrlKey: true }), false);
});
