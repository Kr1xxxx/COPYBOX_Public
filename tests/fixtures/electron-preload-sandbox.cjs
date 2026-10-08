const { app, BrowserWindow } = require("electron");
const path = require("node:path");

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: process.env.CLIPBOX_PRELOAD_PATH || path.resolve("desktop/preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  await window.loadURL("data:text/html,<html><body>Clipbox preload test</body></html>");
  const result = await window.webContents.executeJavaScript(`({
    bridgeType: typeof window.clipboxDesktop,
    capabilities: window.clipboxDesktop?.capabilities ?? null,
    didCopyType: typeof window.clipboxDesktop?.didCopy,
  })`);
  process.stdout.write(`CLIPBOX_PRELOAD_RESULT=${JSON.stringify(result)}\n`);
  app.quit();
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
  app.quit();
});
