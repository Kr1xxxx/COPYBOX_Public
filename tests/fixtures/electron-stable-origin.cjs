const { app, BrowserWindow } = require("electron");
const http = require("node:http");
const path = require("node:path");
const {
  WINDOWS_APP_URL,
  WINDOWS_SERVER_PORT,
} = require(path.resolve("desktop/app-origin.cjs"));

const phase = process.env.CLIPBOX_TEST_PHASE;
const userData = process.env.CLIPBOX_TEST_USER_DATA;
if (!phase || !userData) throw new Error("Missing stable-origin test settings");

app.setPath("userData", userData);

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html" });
  response.end("<!doctype html><title>Clipbox storage test</title>");
});

app.whenReady().then(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(WINDOWS_SERVER_PORT, "127.0.0.1", resolve);
  });
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await window.loadURL(WINDOWS_APP_URL);
  const result = await window.webContents.executeJavaScript(phase === "write"
    ? `localStorage.setItem("clipbox.restart-test", "survives"); localStorage.getItem("clipbox.restart-test")`
    : `localStorage.getItem("clipbox.restart-test")`);
  process.stdout.write(`CLIPBOX_STORAGE_RESULT=${JSON.stringify(result)}\n`);
  app.quit();
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
  app.quit();
});

app.on("before-quit", () => server.close());
