import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { readUiSource } from "./helpers/ui-source.mjs";

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
  const page = readUiSource();
  const preload = fs.readFileSync(new URL("../desktop/preload.cjs", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");
  assert.match(page, /id="set-trash"/);
  assert.match(page, /清空回收站/);
  assert.doesNotMatch(page, /id="set-cli"/);
  assert.match(page, /点击窗口关闭按钮时/);
  assert.match(preload, /setCloseBehavior/);
  assert.match(main, /clipbox:set-close-behavior/);
  assert.match(main, /--hidden/);
  assert.match(main, /classList\.add\('desktop-app', 'platform-\$\{process\.platform\}'\)`/);
  assert.match(page, /迷你窗口复制后/);
  assert.match(preload, /setMiniHidePolicy/);
  assert.match(preload, /setLaunchAtLogin/);
  assert.match(main, /clipbox:set-launch-at-login/);
  assert.match(main, /app\.setLoginItemSettings\(\{ openAtLogin: Boolean\(enabled\)/);
});

test("closing can minimise to the Windows taskbar, and any reopen restores a minimised window", () => {
  const page = readUiSource();
  const main = fs.readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");
  assert.match(main, /behavior === "taskbar"/);
  assert.match(main, /closeBehavior === "taskbar" && isWindows\) mainWindow\.minimize\(\)/);
  assert.match(main, /if \(mainWindow\.isMinimized\(\)\) mainWindow\.restore\(\)/);
  // Dock click on macOS and a second launch on Windows both go through showWindow.
  assert.match(main, /app\.on\("activate"[\s\S]*?showWindow\(false\)/);
  assert.match(main, /app\.on\("second-instance", \(\) => showWindow\(false\)\)/);
  assert.match(page, /缩到任务栏/);
  assert.match(page, /platform === "win32" \? \[\["taskbar"/);
});

// Electron cannot run in CI here, so the main process wiring is checked on its text; the pieces with logic
// (flush request, command bridge, lazy writer) have behaviour tests of their own.
test("a quiet start (launch at login) only puts the tray icon up; server and window start on first use", () => {
  const main = fs.readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");
  const ready = main.slice(main.indexOf("app.whenReady()"), main.indexOf('app.on("activate"'));
  assert.match(ready, /if \(!startHidden\) await ensureWindow\(\);/);
  assert.doesNotMatch(ready, /startServer\(/);
  assert.match(ready, /createTray\(\)/);
  assert.match(main, /wasOpenedAtLogin\) startHidden = true/);
  // the server is started inside ensureWindow, not at launch
  const ensure = main.slice(main.indexOf("function ensureWindow()"), main.indexOf("function showWindow"));
  assert.match(ensure, /startServer\(APP_PORT\)[\s\S]*waitForServer\(\)[\s\S]*createWindow\(\)/);
  // any way of opening goes through showWindow, which creates the window when there is none
  assert.match(main, /function showWindow[\s\S]*?ensureWindow\(\)\.then\(\(\) => showWindow\(asQuickSearch\)\)/);
  assert.match(main, /tray\.on\("click", \(\) => mainWindow\?\.isVisible\(\)/);
  // a command from the command line opens a hidden window instead of failing
  assert.match(main, /ensureReady: async \(\) => \{\s*await ensureWindow\(\);/);
});

test("quitting, sleeping and relaunching ask the page to save first", () => {
  const main = fs.readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");
  const preload = fs.readFileSync(new URL("../desktop/preload.cjs", import.meta.url), "utf8");
  assert.match(main, /app\.on\("before-quit", \(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?flushRequester\.request\(\)\.finally\(\(\) => app\.quit\(\)\)/);
  assert.match(main, /for \(const event of \["suspend", "lock-screen", "shutdown"\]\) powerMonitor\.on\(event/);
  assert.match(main, /async function relaunchApplication\(\)[\s\S]*?await flushRequester\.request\(\);/);
  assert.match(main, /ipcMain\.on\("clipbox:flush-done"/);
  assert.match(preload, /onFlushRequest[\s\S]*clipbox:flush/);
  assert.match(preload, /flushDone: \(\) => ipcRenderer\.send\("clipbox:flush-done"\)/);
});
