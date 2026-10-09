const { app, clipboard, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, safeStorage, screen, session, shell, Tray } = require("electron");
const { createClipboardWriter, isTrustedClipboardRequest } = require("./clipboard.cjs");
const { createAiStore } = require("./ai.cjs");
const { createDeviceKeyStore } = require("./device-key.cjs");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { createRendererCommandBridge } = require("./automation-bridge.cjs");
const { createAutomationServer, installAutomationCli } = require("./automation-server.cjs");
const { APP_HOST, APP_ORIGIN, APP_PORT } = require("./runtime-config.cjs");
const { createMiniWindowStore, createWindowStateStore, MINI_WINDOW_SIZE, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } = require("./window-state.cjs");

let mainWindow;
let serverProcess;
let tray;
let quitting = false;
// quickMode means the window is showing the compact mini layout.
let quickMode = false;
let miniAutoHide = false;
let normalWindowBounds;
let saveWindowTimer;
let saveMiniTimer;
let windowStateStore;
let miniWindowStore;
let automationServer;
let rendererCommandBridge;
let automationRendererReady = false;
const appOrigin = APP_ORIGIN;
const isMac = process.platform === "darwin";
const isWindows = process.platform === "win32";
// Launch-at-login starts Clipbox quietly in the tray.
const startHidden = process.argv.includes("--hidden");
const loginItemOptions = isWindows ? { args: ["--hidden"] } : {};
let closeBehavior = "tray"; // "tray" | "taskbar" (Windows) | "quit"
const WINDOW_STATE_SAVE_DELAY = 180;
const FULL_TRAFFIC_LIGHTS = { x: 14, y: 19 };
const MINI_TRAFFIC_LIGHTS = { x: 14, y: 14 };

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

function saveMiniPosition() {
  clearTimeout(saveMiniTimer);
  saveMiniTimer = undefined;
  if (!quickMode || !mainWindow || mainWindow.isDestroyed() || !miniWindowStore) return;
  const { x, y } = mainWindow.getBounds();
  miniWindowStore.save({ x, y });
}

function scheduleMiniPositionSave() {
  if (!quickMode) return;
  clearTimeout(saveMiniTimer);
  saveMiniTimer = setTimeout(saveMiniPosition, WINDOW_STATE_SAVE_DELAY);
}

function sendWindowMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("clipbox:window-mode", quickMode ? "mini" : "full");
}

function setTrafficLights(position) {
  if (typeof mainWindow?.setWindowButtonPosition === "function") mainWindow.setWindowButtonPosition(position);
}

// The mini window keeps the top-right corner of the full window, unless the
// person has already placed it somewhere else.
function defaultMiniPosition() {
  const bounds = normalWindowBounds?.x === undefined ? mainWindow.getBounds() : normalWindowBounds;
  return { x: Math.round(bounds.x + bounds.width - MINI_WINDOW_SIZE.width), y: Math.round(bounds.y) };
}

function enterMiniMode(autoHide) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (quickMode) {
    miniAutoHide = autoHide;
    sendWindowMode();
    return;
  }
  saveWindowBounds();
  quickMode = true;
  miniAutoHide = autoHide;
  if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  const position = miniWindowStore?.load() || defaultMiniPosition();
  mainWindow.setMinimumSize(MINI_WINDOW_SIZE.width, MINI_WINDOW_SIZE.height);
  mainWindow.setBounds({ ...position, ...MINI_WINDOW_SIZE });
  mainWindow.setResizable(false);
  mainWindow.setMaximizable(false);
  mainWindow.setFullScreenable(false);
  mainWindow.setAlwaysOnTop(true, "floating");
  setTrafficLights(MINI_TRAFFIC_LIGHTS);
  sendWindowMode();
}

function enterFullMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!quickMode) {
    sendWindowMode();
    return;
  }
  saveMiniPosition();
  quickMode = false;
  miniAutoHide = false;
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setResizable(true);
  mainWindow.setMaximizable(true);
  mainWindow.setFullScreenable(true);
  mainWindow.setMinimumSize(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT);
  if (normalWindowBounds) mainWindow.setBounds(normalWindowBounds);
  setTrafficLights(FULL_TRAFFIC_LIGHTS);
  sendWindowMode();
}

function createWindow() {
  automationRendererReady = false;
  windowStateStore = createWindowStateStore({
    filePath: path.join(app.getPath("userData"), "window-state.json"),
    getWorkAreas: () => screen.getAllDisplays().map((display) => display.workArea),
  });
  miniWindowStore = createMiniWindowStore({
    filePath: path.join(app.getPath("userData"), "mini-window-state.json"),
    getWorkAreas: () => screen.getAllDisplays().map((display) => display.workArea),
  });
  normalWindowBounds = windowStateStore.load();
  mainWindow = new BrowserWindow({
    ...normalWindowBounds,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1c1b19" : "#faf9f5",
    title: "Clipbox",
    icon: path.join(__dirname, "assets", isWindows ? "Clipbox.ico" : "Clipbox.png"),
    // macOS draws its own traffic lights over the sidebar; Windows keeps the native title bar.
    ...(isMac ? { titleBarStyle: "hiddenInset", trafficLightPosition: FULL_TRAFFIC_LIGHTS } : { autoHideMenuBar: true }),
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
    void mainWindow.webContents.executeJavaScript(`document.documentElement.classList.add('desktop-app', 'platform-${process.platform}')`);
  });
  mainWindow.webContents.once("did-finish-load", () => { if (!startHidden) mainWindow.show(); });
  mainWindow.webContents.on("did-finish-load", sendWindowMode);
  mainWindow.on("move", scheduleWindowBoundsSave);
  mainWindow.on("move", scheduleMiniPositionSave);
  mainWindow.on("resize", scheduleWindowBoundsSave);
  mainWindow.on("close", (event) => {
    saveWindowBounds();
    saveMiniPosition();
    if (!quitting) {
      if (closeBehavior === "quit") {
        quitting = true;
        app.quit();
        return;
      }
      event.preventDefault();
      // "taskbar" keeps the taskbar button, so a click on it brings the window back; "tray" hides it completely.
      if (closeBehavior === "taskbar" && isWindows) mainWindow.minimize();
      else mainWindow.hide();
    }
  });
  mainWindow.once("ready-to-show", () => {
    if (!startHidden) mainWindow.show();
  });
  void mainWindow.loadURL(appOrigin);
}

// A tray click or "快速搜索" opens the mini window and (by setting) hides it again
// after a copy. Other ways of opening Clipbox return to the full window.
function showWindow(asQuickSearch = false) {
  if (!mainWindow) return;
  if (asQuickSearch) enterMiniMode(true);
  else enterFullMode();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("clipbox:focus-search");
}

function createTray() {
  const size = isWindows ? 16 : 18;
  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "Clipbox.png")).resize({ width: size, height: size });
  if (isMac) icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Clipbox");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "快速搜索", click: () => showWindow(true) },
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
  if (isWindows) Menu.setApplicationMenu(null);
  try {
    startServer(APP_PORT);
    await waitForServer();
    createWindow();
    // The automation CLI is a macOS/Linux unix-socket helper; Windows does not use it.
    if (!isWindows) await startAutomation();
    createTray();
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
  saveMiniPosition();
  saveWindowBounds();
  quitting = true;
  void stopAutomation();
  if (serverProcess && !serverProcess.killed) serverProcess.kill("SIGTERM");
});

let miniHidePolicy = "hotkey"; // "hotkey" | "always" | "never"

ipcMain.on("clipbox:did-copy", () => {
  if (!quickMode || miniHidePolicy === "never") return;
  if (miniHidePolicy === "always" || miniAutoHide) setTimeout(() => mainWindow?.hide(), 1200);
});

ipcMain.on("clipbox:set-mini-hide-policy", (event, policy) => {
  if (!mainWindow || mainWindow.webContents !== event.sender) return;
  if (policy === "hotkey" || policy === "always" || policy === "never") miniHidePolicy = policy;
});

ipcMain.on("clipbox:set-close-behavior", (event, behavior) => {
  if (!mainWindow || mainWindow.webContents !== event.sender) return;
  if (behavior === "tray" || behavior === "quit" || behavior === "taskbar") closeBehavior = behavior;
});

ipcMain.on("clipbox:set-theme", (event, theme) => {
  if (!mainWindow || mainWindow.webContents !== event.sender) return;
  if (theme === "system" || theme === "light" || theme === "dark") nativeTheme.themeSource = theme;
});

ipcMain.handle("clipbox:open-data-folder", async (event) => {
  if (!mainWindow || mainWindow.webContents !== event.sender) throw new Error("Request denied");
  const failure = await shell.openPath(app.getPath("userData"));
  if (failure) throw new Error(failure);
  return app.getPath("userData");
});

ipcMain.handle("clipbox:get-launch-at-login", (event) => {
  if (!mainWindow || mainWindow.webContents !== event.sender) return false;
  return app.getLoginItemSettings(loginItemOptions).openAtLogin;
});

ipcMain.handle("clipbox:set-launch-at-login", (event, enabled) => {
  if (!mainWindow || mainWindow.webContents !== event.sender) throw new Error("Request denied");
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: true, ...loginItemOptions });
  return app.getLoginItemSettings(loginItemOptions).openAtLogin;
});

ipcMain.on("clipbox:set-window-mode", (event, mode) => {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents !== event.sender) return;
  if (mode === "mini") enterMiniMode(false);
  else enterFullMode();
});

const writeClipboard = createClipboardWriter(clipboard);
ipcMain.handle("clipbox:copy-text", (event, text) => {
  if (!isTrustedClipboardRequest(event, mainWindow, appOrigin)) throw new Error("Clipboard request denied");
  writeClipboard(text);
});

// The user's own AI interface; the key stays here and is never handed to the page.
let aiStore;
function aiStoreFor(event) {
  if (!isTrustedClipboardRequest(event, mainWindow, appOrigin)) throw new Error("Request denied");
  aiStore ||= createAiStore({ filePath: path.join(app.getPath("userData"), "ai-key.json"), fs, safeStorage });
  return aiStore;
}
ipcMain.handle("clipbox:ai-status", (event) => aiStoreFor(event).status());
ipcMain.handle("clipbox:ai-save", (event, settings) => aiStoreFor(event).save(settings || {}));
ipcMain.handle("clipbox:ai-clear", (event) => aiStoreFor(event).clear());
ipcMain.handle("clipbox:ai-request", (event, payload) => aiStoreFor(event).request(payload || {}));

// The vault's device key, encrypted by the OS (Windows). Only the app's own main frame may ask.
let deviceKeyStore;
function deviceKeyStoreFor(event) {
  if (!isTrustedClipboardRequest(event, mainWindow, appOrigin)) throw new Error("Request denied");
  deviceKeyStore ||= createDeviceKeyStore({ filePath: path.join(app.getPath("userData"), "device-key.json"), fs, safeStorage });
  return deviceKeyStore;
}
ipcMain.handle("clipbox:device-key-available", (event) => deviceKeyStoreFor(event).available());
ipcMain.handle("clipbox:device-key-get", (event) => deviceKeyStoreFor(event).get());
ipcMain.handle("clipbox:device-key-set", (event, record) => deviceKeyStoreFor(event).set(record));

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
