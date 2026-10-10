const { contextBridge, ipcRenderer } = require("electron");

// Only quiet the presentation: the vault, pending writes, clipboard expiry,
// and automation bridge must keep working while the window is at rest.
window.addEventListener("DOMContentLoaded", () => {
  const idleDelay = 30_000;
  let idleTimer;

  function rest() {
    clearTimeout(idleTimer);
    document.documentElement.classList.add("clipbox-idle");
  }

  function wake() {
    clearTimeout(idleTimer);
    if (document.hidden || !document.hasFocus()) {
      rest();
      return;
    }
    document.documentElement.classList.remove("clipbox-idle");
    idleTimer = setTimeout(rest, idleDelay);
  }

  window.addEventListener("focus", wake);
  window.addEventListener("blur", rest);
  document.addEventListener("visibilitychange", wake);
  for (const event of ["pointerdown", "pointermove", "keydown", "wheel", "input"]) {
    window.addEventListener(event, wake, { capture: true, passive: true });
  }
  wake();
}, { once: true });


contextBridge.exposeInMainWorld("clipboxDesktop", {
  platform: process.platform,
  copyText: (text) => ipcRenderer.invoke("clipbox:copy-text", text),
  copyImage: (png) => ipcRenderer.invoke("clipbox:copy-image", png),
  didCopy: () => ipcRenderer.send("clipbox:did-copy"),
  setTheme: (theme) => ipcRenderer.send("clipbox:set-theme", theme),
  openDataFolder: () => ipcRenderer.invoke("clipbox:open-data-folder"),
  setCloseBehavior: (behavior) => ipcRenderer.send("clipbox:set-close-behavior", behavior),
  setMiniHidePolicy: (policy) => ipcRenderer.send("clipbox:set-mini-hide-policy", policy),
  getLaunchAtLogin: () => ipcRenderer.invoke("clipbox:get-launch-at-login"),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke("clipbox:set-launch-at-login", enabled),
  getVersion: () => ipcRenderer.invoke("clipbox:get-version"),
  checkUpdate: () => ipcRenderer.invoke("clipbox:check-update"),
  openUpdate: () => ipcRenderer.invoke("clipbox:open-update"),
  aiStatus: () => ipcRenderer.invoke("clipbox:ai-status"),
  aiSave: (settings) => ipcRenderer.invoke("clipbox:ai-save", settings),
  aiClear: () => ipcRenderer.invoke("clipbox:ai-clear"),
  aiRequest: (payload) => ipcRenderer.invoke("clipbox:ai-request", payload),
  fetchSharedLibrary: (url) => ipcRenderer.invoke("clipbox:fetch-shared-library", url),
  relaunch: () => ipcRenderer.send("clipbox:relaunch"),
  onFocusSearch: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("clipbox:focus-search", listener);
    return () => ipcRenderer.removeListener("clipbox:focus-search", listener);
  },
  onAutomationCommand: (callback) => {
    const listener = (_event, request) => callback(request);
    ipcRenderer.on("clipbox:automation-command", listener);
    return () => ipcRenderer.removeListener("clipbox:automation-command", listener);
  },
  respondAutomationCommand: (requestId, response) => {
    ipcRenderer.send("clipbox:automation-response", { requestId, response });
  },
  automationReady: () => ipcRenderer.send("clipbox:automation-ready"),
  setWindowMode: (mode) => ipcRenderer.send("clipbox:set-window-mode", mode === "mini" ? "mini" : "full"),
  onWindowMode: (callback) => {
    const listener = (_event, mode) => callback(mode === "mini" ? "mini" : "full");
    ipcRenderer.on("clipbox:window-mode", listener);
    return () => ipcRenderer.removeListener("clipbox:window-mode", listener);
  },
});
