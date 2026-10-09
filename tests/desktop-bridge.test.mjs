import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const bridge = fs.readFileSync(new URL("../app/desktop-bridge.ts", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("the window.clipboxDesktop type lives in desktop-bridge.ts", () => {
  assert.match(bridge, /export type ClipboxDesktop = \{/);
  assert.match(bridge, /declare global\s*\{\s*interface Window\s*\{\s*clipboxDesktop\?: ClipboxDesktop;/);
});

test("page.tsx no longer declares globals and still loads the bridge type", () => {
  assert.doesNotMatch(page, /declare global/);
  assert.match(page, /import "\.\/desktop-bridge";/);
});
