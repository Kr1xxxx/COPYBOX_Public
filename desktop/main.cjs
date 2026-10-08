const { app, clipboard, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, session, Tray } = require("electron");
const { createClipboardWriter, isTrustedClipboardRequest } = require("./clipboard.cjs");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { createRendererCommandBridge } = require("./automation-bridge.cjs");
const { createAutomationServer, installAutomationCli } = require("./automation-server.cjs");
const { APP_HOST, APP_ORIGIN, APP_PORT } = require("./runtime-config.cjs");
const { createWindowStateStore } = require("./window-state.cjs");

let mainWindow;
let serverProcess;
let tray;
let quitting = false;
let quickMode = false;
let normalWindowBounds;
let saveWindowTimer;
let windowStateStore;
let automationServer;
let rendererCommandBridge;
let automationRendererReady = false;
const appOrigin = APP_ORIGIN;
const WINDOW_STATE_SAVE_DELAY = 180;

function serverEntry() {
  if (!app.isPackaged) {
    return path.join(__dirname, "..", "dist", "server", "index.js");
  }

  const bundledRuntime = path.join(process.resourcesPath, "standalone");
  const runtimeId = fs.readFileSync(path.join(bundledRuntime, ".runtime-id"), "utf8").trim();
  const runtimeName = `server-runtime-${runtimeId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const runtimeRoot = path.join(app.getPath("userData"), runtimeName);
  const entry = path.join(runtimeRoot, "server.js");

  if (!fs.existsSync(entry)) {
    const temporaryRoot = `${runtimeRoot}.tmp-${process.pid}`;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    fs.cpSync(bundledRuntime, temporaryRoot, { recursive: true });
    fs.renameSync(path.join(temporaryRoot, "modules"), path.join(temporaryRoot, "node_modules"));
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
    fs.renameSync(temporaryRoot, runtimeRoot);
  }

  for (const name of fs.readdirSync(app.getPath("userData"))) {
    if (name.startsWith("server-runtime-") && name !== runtimeName) {
      fs.rmSync(path.join(app.getPath("userData"), name), { recursive: true, force: true });
    }
  }

  return entry;
}

function startServer(port) {
  const serverArgs = app.isPackaged
    ? [serverEntry()]
    : [path.join(__dirname, "..", "node_modules", "vinext", "dist", "cli.js"), "start"];
  serverProcess = spawn(process.execPath, serverArgs, {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOST: APP_HOST,
      PORT: String(port),
      NODE_ENV: "production",
    },
    stdio: "ignore",
  });
  serverProcess.once("exit", (code) => {
    if (!quitting && code !== 0) {
      void dialog.showErrorBox("Clipbox 无法启动", "本地服务启动失败，请重新打开应用。");
      app.quit();
    }
  });
}

function waitForServer(timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(appOrigin, (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => {
        if (Date.now() - startedAt >= timeoutMs) reject(new Error("Server timeout"));
        else setTimeout(check, 120);
      });
      request.setTimeout(1000, () => request.destroy());
    };
    check();
  });
}

function stopServer(timeoutMs = 1200) {
  const child = serverProcess;
  serverProcess = undefined;
  if (!child || child.killed) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    child.once("exit", finish);
    try {
      child.kill("SIGTERM");
    } catch {
      finish();
    }
  });
}

async function startAutomation() {
  const socketPath = process.env.CLIPBOX_AUTOMATION_SOCKET_PATH
    || path.join(app.getPath("userData"), "automation.sock");
  installAutomationCli({
    sourcePath: path.join(__dirname, "clipbox-cli.cjs"),
    targetPath: path.join(app.getPath("home"), ".local", "bin", "clipbox"),
  });
  rendererCommandBridge = createRendererCommandBridge({
    createId: randomUUID,
    isReady: () => Boolean(automationRendererReady && mainWindow && !mainWindow.isDestroyed()),
    send: (request) => mainWindow.webContents.send("clipbox:automation-command", request),
  });
  automationServer = createAutomationServer({
    socketPath,
    forward: (command) => rendererCommandBridge.forward(command),
  });
  await automationServer.start();
}

async function stopAutomation() {
  automationRendererReady = false;
  rendererCommandBridge?.close();
  rendererCommandBridge = undefined;
  const server = automationServer;
  automationServer = undefined;
  await server?.close();
}

async function relaunchApplication() {
  if (quitting) return;
  saveWindowBounds();
  quitting = true;
  globalShortcut.unregisterAll();
  await stopAutomation();
  await stopServer();
  app.relaunch();
  app.exit(0);
}

function saveWindowBounds() {
  clearTimeout(saveWindowTimer);
  saveWindowTimer = undefined;
  if (quickMode) return;
  if (!mainWindow || mainWindow.isDestroyed() || !windowStateStore) return;
  normalWindowBounds = mainWindow.getNormalBounds();
  windowStateStore.save(mainWindow.getNormalBounds());
}

function scheduleWindowBoundsSave() {
  if (quickMode) return;
  clearTimeout(saveWindowTimer);
  saveWindowTimer = setTimeout(saveWindowBounds, WINDOW_STATE_SAVE_DELAY);
}

function createWindow() {
  automationRendererReady = false;
  windowStateStore = createWindowStateStore({
    filePath: path.join(app.getPath("userData"), "window-state.json"),
    getWorkAreas: () => screen.getAllDisplays().map((display) => display.workArea),
  });
  normalWindowBounds = windowStateStore.load();
  mainWindow = new BrowserWindow({
    ...normalWindowBounds,
    minWidth: 500,
    minHeight: 520,
    show: false,
    backgroundColor: "#070707",
    title: "Clipbox",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(appOrigin)) event.preventDefault();
  });
  mainWindow.webContents.on("dom-ready", () => {
    void mainWindow.webContents.executeJavaScript("document.documentElement.classList.add('desktop-app')");
  });
  mainWindow.webContents.once("did-finish-load", () => mainWindow.show());
  mainWindow.on("move", scheduleWindowBoundsSave);
  mainWindow.on("resize", scheduleWindowBoundsSave);
  mainWindow.on("close", (event) => {
    saveWindowBounds();
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });
  void mainWindow.loadURL(appOrigin);
}

function showWindow(asQuickSearch = false) {
  if (!mainWindow) return;
  const wasQuickMode = quickMode;
  if (asQuickSearch && !wasQuickMode) saveWindowBounds();
  quickMode = asQuickSearch;
  if (asQuickSearch) {
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({ ...bounds, width: Math.max(520, Math.min(bounds.width, 680)), height: Math.max(540, Math.min(bounds.height, 680)) });
  } else if (wasQuickMode && normalWindowBounds) {
    mainWindow.setBounds(normalWindowBounds);
  }
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("clipbox:focus-search");
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "Clipbox.png")).resize({ width: 18, height: 18 });
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Clipbox · ⌥ Space 快速搜索");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "快速搜索", accelerator: "Alt+Space", click: () => showWindow(true) },
    { label: "打开 Clipbox", click: () => showWindow(false) },
    { type: "separator" },
    { label: "退出", click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on("click", () => mainWindow?.isVisible() ? mainWindow.hide() : showWindow(true));
}

app.setName("Clipbox");
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
app.on("second-instance", () => showWindow(false));
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "clipboard-read" || permission === "clipboard-sanitized-write");
  });
  try {
    startServer(APP_PORT);
    await waitForServer();
    createWindow();
    await startAutomation();
    createTray();
    globalShortcut.register("Alt+Space", () => mainWindow?.isVisible() ? mainWindow.hide() : showWindow(true));
  } catch {
    dialog.showErrorBox("Clipbox 无法启动", "本地服务未能启动，请重新打开应用。");
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverProcess) createWindow();
  else showWindow(false);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  saveWindowBounds();
  quitting = true;
  globalShortcut.unregisterAll();
  void stopAutomation();
  if (serverProcess && !serverProcess.killed) serverProcess.kill("SIGTERM");
});

ipcMain.on("clipbox:did-copy", () => {
  if (quickMode) setTimeout(() => mainWindow?.hide(), 1200);
});

const writeClipboard = createClipboardWriter(clipboard);
ipcMain.handle("clipbox:copy-text", (event, text) => {
  if (!isTrustedClipboardRequest(event, mainWindow, appOrigin)) throw new Error("Clipboard request denied");
  writeClipboard(text);
});

ipcMain.handle("clipbox:get-version", () => app.getVersion());

ipcMain.on("clipbox:relaunch", () => {
  void relaunchApplication();
});

ipcMain.on("clipbox:automation-ready", (event) => {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents === event.sender) {
    automationRendererReady = true;
  }
});

ipcMain.on("clipbox:automation-response", (event, message) => {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents === event.sender) {
    rendererCommandBridge?.respond(message);
  }
});
