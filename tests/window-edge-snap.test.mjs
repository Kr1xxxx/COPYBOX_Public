// D-078: the 贴边 switch reaches the shell, and the Mac size limit is wired into the window code.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("the mini edge-snap switch is remembered and sent to the shell (Windows only)", () => {
  const page = read("../app/page.tsx");
  const settings = read("../app/settings.tsx");
  const bridge = read("../src-tauri/bridge.js");
  const main = read("../src-tauri/src/main.rs");
  assert.match(page, /MINI_EDGE_KEY = "clipbox\.mini-edge-snap"/);
  assert.match(page, /setMiniEdgeSnap\?\.\(on\)/);
  assert.match(settings, /platform === "win32" && <div className="settings-row"><div><strong>迷你窗口贴边收起<\/strong>/);
  assert.match(bridge, /setMiniEdgeSnap: function \(on\) \{ fireAndForget\("set_mini_edge_snap", \{ on: Boolean\(on\) \}\); \}/);
  assert.match(main, /window_mode::set_mini_edge_snap/);
  assert.match(main, /window_mode::watch_mouse\(/);
});

test("the Mac window is capped and cannot zoom or go full screen", () => {
  const main = read("../src-tauri/src/main.rs");
  const state = read("../src-tauri/src/window_state.rs");
  assert.match(state, /MAC_MAX_WIDTH: f64 = 1000\.0/);
  assert.match(state, /MAC_MAX_HEIGHT: f64 = 800\.0/);
  assert.match(main, /\.max_inner_size\(window_state::MAC_MAX_WIDTH, window_state::MAC_MAX_HEIGHT\)\s*\.maximizable\(false\)/);
  assert.match(main, /sub\.text\(\)\? == "View"/);
});
