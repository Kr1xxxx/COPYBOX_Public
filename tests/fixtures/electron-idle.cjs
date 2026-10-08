const { app, BrowserWindow, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 540, height: 600,
    webPreferences: {
      partition: `idle-test-${process.pid}`,
      preload: path.resolve("desktop/preload.cjs"),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
    },
  });
  const run = (source) => window.webContents.executeJavaScript(source);
  async function focusWindow() {
    window.show();
    const deadline = Date.now() + 5_000;
    do {
      app.focus({ steal: true });
      window.focus();
      await delay(100);
      if (await run("document.hasFocus() && !document.hidden")) return;
    } while (Date.now() < deadline);
    throw new Error("The test could not acquire desktop focus");
  }
  const css = fs.readFileSync(path.resolve("app/globals.css"), "utf8");
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><head><style>${css}</style></head><body>
    <input id="draft" value="unsaved test draft">
    <button class="floating-add"><span>+</span></button>
    <button class="refresh-button refreshing"><span>↻</span></button>
  </body></html>`)}`);
  await focusWindow();
  assert.equal(await run("getComputedStyle(document.querySelector('.floating-add')).animationName"), "none", "the resting add button must not animate forever");
  const paused = () => run("getComputedStyle(document.querySelector('.refreshing span')).animationPlayState === 'paused'");
  assert.equal(await paused(), false, `active operation feedback remains animated: ${JSON.stringify(await run("({focus:document.hasFocus(),hidden:document.hidden,idle:document.documentElement.className})"))}`);
  const other = new BrowserWindow({ width: 150, height: 100 });
  await other.loadURL("data:text/html,Focus test");
  other.focus();
  await delay(300);
  assert.equal(await paused(), true, "an unfocused window must rest immediately");
  other.destroy();
  await focusWindow();
  await delay(200);
  assert.equal(await paused(), false, "focus wakes the UI");
  window.minimize();
  await delay(300);
  assert.equal(await paused(), true, "a minimized window must rest");
  window.restore(); window.focus();
  await delay(200);
  window.hide();
  await delay(300);
  assert.equal(await paused(), true, "a hidden window must rest");
  assert.match(await run("document.querySelector('#draft').value"), /^unsaved test draft/, "hiding preserves the unsaved editor");
  if (process.platform !== "win32") {
    await run("window.clipboxDesktop.onAutomationCommand(({requestId}) => window.clipboxDesktop.respondAutomationCommand(requestId, {ok: true})); void 0");
    const reply = new Promise((resolve) => ipcMain.once("clipbox:automation-response", (_event, value) => resolve(value)));
    window.webContents.send("clipbox:automation-command", { requestId: "idle-test", command: { action: "status" } });
    assert.deepEqual(await reply, { requestId: "idle-test", response: { ok: true } }, "hidden renderer still handles commands");
  }
  await focusWindow();
  await delay(300);
  assert.equal(await paused(), false, "reopening wakes the UI");
  await run("document.querySelector('#draft').focus()");
  // Advance Chromium's clock in all worlds, including the sandboxed preload.
  // This avoids requiring exclusive desktop focus for 30 wall-clock seconds.
  window.webContents.debugger.attach("1.3");
  // Native focus/blur was checked above. Stabilize only the timed foreground
  // case so a user switching apps cannot change what this case exercises.
  await window.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
  await run("window.dispatchEvent(new Event('focus')); void 0");
  assert.equal(await paused(), false, "foreground activity starts the idle countdown");
  const elapsed = new Promise((resolve) => {
    window.webContents.debugger.on("message", (_event, method) => {
      if (method === "Emulation.virtualTimeBudgetExpired") resolve();
    });
  });
  await window.webContents.debugger.sendCommand("Emulation.setVirtualTimePolicy", { policy: "advance", budget: 31_000 });
  await elapsed;
  assert.equal(await paused(), true, "an untouched foreground window must rest");
  assert.equal(await run("getComputedStyle(document.querySelector('#draft')).caretColor"), "rgba(0, 0, 0, 0)", "idle text caret must stop blinking");
  assert.equal(await run("document.hasFocus()"), true, "foreground idle measurement requires the test window to retain focus");
  await run("document.querySelector('#draft').dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })); void 0");
  assert.equal(await paused(), false, "typing wakes the UI immediately");

  process.stdout.write("CLIPBOX_IDLE_OK\n");
  app.quit();
}).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  app.exit(1);
});
