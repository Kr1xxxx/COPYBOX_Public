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
  const wanted = [...type.matchAll(/^\s{2}(\w+)\??:/gm)].map((match) => match[1]).filter((name) => name !== "platform");
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
