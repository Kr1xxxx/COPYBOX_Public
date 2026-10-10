import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureTitle,
  patchPreloadHelper,
  previewBuildInfo,
  relativizeAssets,
  renderWrapper,
  withDesktopShim,
} from "../tools/preview/build.mjs";

test("relativizeAssets rewrites plain, rooted and escaped paths", () => {
  const input = 'href="/_next/static/css/a.css" "_next/static/chunks/b.js" \\"/_next/static/x.js\\" \\/_next\\/static\\/y.js';
  const out = relativizeAssets(input);
  assert.equal(out, 'href="assets/static/css/a.css" "assets/static/chunks/b.js" \\"assets/static/x.js\\" assets\\/static\\/y.js');
  assert.ok(!out.includes("_next"));
});

test("patchPreloadHelper patches exactly one match", () => {
  const js = "var x=function(e){return`/`+e},y=1";
  const out = patchPreloadHelper(js);
  assert.ok(out.includes("=function(e){return new URL(`../../../`+e,import.meta.url).href}"));
  assert.throws(() => patchPreloadHelper("nothing here"), /0 times/);
  assert.throws(() => patchPreloadHelper(js + ";" + js), /2 times/);
});

test("withDesktopShim inserts the shim right after <head> for both platforms", () => {
  const html = "<html><head><meta charset=utf-8></head><body></body></html>";
  const win = withDesktopShim(html, "win32");
  assert.ok(win.startsWith("<html><head><script>"));
  assert.ok(win.includes('platform: "win32"'));
  assert.ok(win.includes('add("desktop-app", "platform-win32")'));
  assert.ok(win.includes("</script><meta charset=utf-8>"));
  const mac = withDesktopShim(html, "darwin");
  assert.ok(mac.includes('platform: "darwin"'));
  assert.ok(mac.includes('add("desktop-app", "platform-darwin")'));
  assert.ok(!mac.includes("win32"));
  assert.throws(() => withDesktopShim(html, "linux"));
});

test("renderWrapper replaces the version", () => {
  assert.equal(renderWrapper("v__VERSION__ / __VERSION__", "1.02\n"), "v1.02 / 1.02");
});

test("ensureTitle adds a title only when missing", () => {
  assert.equal(ensureTitle("<head></head>"), "<head><title>Clipbox</title></head>");
  const has = "<head><title>X</title></head>";
  assert.equal(ensureTitle(has), has);
});

test("previewBuildInfo takes the update time from the newest changelog entry, else the build time", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  assert.deepEqual(previewBuildInfo([{ version: "1.13", at: "2026-10-10 21:37" }], "1.13\n", now), { version: "1.13", updatedAt: "2026-10-10T21:37:00+08:00" });
  assert.deepEqual(previewBuildInfo([{ version: "1.13" }], "1.13", now), { version: "1.13", updatedAt: now.toISOString() });
  assert.deepEqual(previewBuildInfo([], "1.13", now), { version: "1.13", updatedAt: now.toISOString() });
});

test("the shim answers getVersion and getBuildTime, and the wrapper shows the update time", () => {
  const out = withDesktopShim("<head></head>", "win32", { version: "1.13", updatedAt: "2026-10-10T21:37:00+08:00" });
  assert.ok(out.includes('Promise.resolve("1.13")'));
  assert.ok(out.includes('Promise.resolve("2026-10-10T21:37:00+08:00")'));
  assert.ok(renderWrapper("v__VERSION__ __UPDATED__", "1.13", "2026-10-10 21:37") === "v1.13 2026-10-10 21:37");
});
