const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");

let serverProcess;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(origin, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(origin);
      await response.body?.cancel();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Timed out waiting for Clipbox test server");
}

async function inspectUi(window) {
  return window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const inspect = () => {
      const list = document.querySelector(".native-list");
      const startupError = document.querySelector(".startup-error");
      if (list || startupError) {
        const sidebarImport = document.querySelector(".snippet-import-button");
        resolve({
          text: document.body.innerText,
          hasKindSwitcher: Boolean(document.querySelector(".home-switch")),
          hasSnippetHeading: Boolean(document.querySelector(".snippet-edition-heading")),
          emptyActionLabels: Array.from(
            document.querySelectorAll(".snippet-empty-actions button"),
            (node) => node.textContent.trim(),
          ),
          sidebarImportFits: sidebarImport
            ? sidebarImport.scrollWidth <= sidebarImport.clientWidth && sidebarImport.scrollHeight <= sidebarImport.clientHeight
            : false,
          hasLegacyVault: localStorage.getItem("clipbox.legacy-vault.v1") !== null,
          hasStartupError: Boolean(startupError),
          currentVaultRewritten: window.clipboxTest?.currentVaultWasRewritten?.() || false,
        });
        return;
      }
      if (Date.now() - startedAt > 15000) {
        reject(new Error("Timed out waiting for Clipbox UI"));
        return;
      }
      setTimeout(inspect, 50);
    };
    inspect();
  })`);
}

app.whenReady().then(async () => {
  try {
    const port = await findFreePort();
    const origin = `http://127.0.0.1:${port}`;
    serverProcess = spawn(process.execPath, [path.resolve("dist/standalone/server.js")], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        HOST: "127.0.0.1",
        PORT: String(port),
        NODE_ENV: "production",
      },
      stdio: "ignore",
    });
    await waitForServer(origin);

    const width = Number(process.env.CLIPBOX_TEST_WIDTH || 680);
    const height = Number(process.env.CLIPBOX_TEST_HEIGHT || 620);
    const window = new BrowserWindow({
      width,
      height,
      show: Boolean(process.env.CLIPBOX_SCREENSHOT),
      webPreferences: {
        ...(process.env.CLIPBOX_TEST_NO_PRELOAD === "1" ? {} : { preload: path.resolve("tests/fixtures/snippet-only-preload.cjs") }),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    await window.loadURL(`${origin}/?clipbox-desktop=win32`);
    const result = await inspectUi(window);
    if (process.env.CLIPBOX_SCREENSHOT) {
      await window.webContents.executeJavaScript(`new Promise((resolve) => setTimeout(resolve, 400))`);
      const screenshotPath = path.resolve(process.env.CLIPBOX_SCREENSHOT);
      await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
      const image = await window.webContents.capturePage();
      await fs.writeFile(screenshotPath, image.toPNG());
    }
    if (process.env.CLIPBOX_EDITOR_SCREENSHOT) {
      await window.webContents.executeJavaScript(`document.querySelector(".snippet-empty-actions .primary").click()`);
      await window.webContents.executeJavaScript(`new Promise((resolve) => {
        const wait = () => document.querySelector(".editor-dialog") ? resolve() : setTimeout(wait, 50);
        wait();
      })`);
      await window.webContents.executeJavaScript(`new Promise((resolve) => setTimeout(resolve, 400))`);
      const screenshotPath = path.resolve(process.env.CLIPBOX_EDITOR_SCREENSHOT);
      await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
      const image = await window.webContents.capturePage();
      await fs.writeFile(screenshotPath, image.toPNG());
    }
    process.stdout.write(`CLIPBOX_RESULT=${JSON.stringify(result)}\n`);
    app.quit();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exitCode = 1;
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill("SIGTERM");
});
