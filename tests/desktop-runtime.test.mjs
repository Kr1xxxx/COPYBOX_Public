import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("uses one stable localhost origin so encrypted vault data survives restarts", () => {
  const runtime = require("../desktop/runtime-config.cjs");

  assert.equal(runtime.APP_HOST, "127.0.0.1");
  assert.equal(runtime.APP_PORT, 47831);
  assert.equal(runtime.APP_ORIGIN, "http://127.0.0.1:47831");
});

test("restores and persists normal window bounds across desktop restarts", () => {
  const source = fs.readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");

  assert.match(source, /createWindowStateStore/);
  assert.match(source, /screen\.getAllDisplays\(\)/);
  assert.match(source, /mainWindow\.on\("move", scheduleWindowBoundsSave\)/);
  assert.match(source, /mainWindow\.on\("resize", scheduleWindowBoundsSave\)/);
  assert.match(source, /if \(quickMode\) return;/);
  assert.match(source, /windowStateStore\.save\(mainWindow\.getNormalBounds\(\)\)/);
  assert.match(source, /saveWindowBounds\(\);\s+quitting = true;/);
});

test("keeps the full window at least 680×620 and switches to a fixed, floating mini window", () => {
  const source = fs.readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");
  const preload = fs.readFileSync(new URL("../desktop/preload.cjs", import.meta.url), "utf8");

  assert.match(source, /minWidth: MIN_WINDOW_WIDTH,\s+minHeight: MIN_WINDOW_HEIGHT,/);
  assert.match(source, /mainWindow\.setBounds\(\{ \.\.\.position, \.\.\.MINI_WINDOW_SIZE \}\)/);
  assert.match(source, /mainWindow\.setResizable\(false\)/);
  assert.match(source, /mainWindow\.setAlwaysOnTop\(true, "floating"\)/);
  assert.match(source, /mainWindow\.setMinimumSize\(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT\)/);
  assert.match(source, /miniHidePolicy === "always" \|\| miniAutoHide\) setTimeout/);
  assert.match(source, /miniHidePolicy === "never"\) return/);
  assert.match(source, /mainWindow\.webContents !== event\.sender\) return;/);
  assert.match(preload, /setWindowMode: \(mode\) => ipcRenderer\.send\("clipbox:set-window-mode"/);
  assert.match(preload, /ipcRenderer\.on\("clipbox:window-mode", listener\)/);
});

test("settings expose trash management, mini hide policy and launch at login", () => {
  const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const preload = fs.readFileSync(new URL("../desktop/preload.cjs", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");
  assert.match(page, /id="set-trash"/);
  assert.match(page, /清空回收站/);
  assert.match(page, /id="set-cli"/);
  assert.match(page, /迷你窗口复制后/);
  assert.match(preload, /setMiniHidePolicy/);
  assert.match(preload, /setLaunchAtLogin/);
  assert.match(main, /clipbox:set-launch-at-login/);
  assert.match(main, /app\.setLoginItemSettings\(\{ openAtLogin/);
});
