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

// Sandboxed preload scripts cannot require local CommonJS modules, so this
// security-critical profile must remain self-contained in this file.
const windows = process.platform === "win32";
const profile = Object.freeze({
  edition: windows ? "snippet-only" : "full",
  platform: windows ? "win32" : "darwin",
  supportsSecrets: !windows,
  supportsExport: !windows,
  supportsAutomation: !windows,
  shortcutLabel: windows ? "" : "⌥ Space",
});

const desktopBridge = {
  capabilities: Object.freeze({
    edition: profile.edition,
    platform: profile.platform,
    supportsSecrets: profile.supportsSecrets,
    supportsExport: profile.supportsExport,
    supportsAutomation: profile.supportsAutomation,
    globalShortcut: profile.shortcutLabel,
  }),
  copyText: (text) => ipcRenderer.invoke("clipbox:copy-text", text),
  didCopy: () => ipcRenderer.send("clipbox:did-copy"),
  getVersion: () => ipcRenderer.invoke("clipbox:get-version"),
  relaunch: () => ipcRenderer.send("clipbox:relaunch"),
  onFocusSearch: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("clipbox:focus-search", listener);
    return () => ipcRenderer.removeListener("clipbox:focus-search", listener);
  },
};

if (profile.supportsAutomation) Object.assign(desktopBridge, {
  onAutomationCommand: (callback) => {
    const listener = (_event, request) => callback(request);
    ipcRenderer.on("clipbox:automation-command", listener);
    return () => ipcRenderer.removeListener("clipbox:automation-command", listener);
  },
  respondAutomationCommand: (requestId, response) => {
    ipcRenderer.send("clipbox:automation-response", { requestId, response });
  },
  automationReady: () => ipcRenderer.send("clipbox:automation-ready"),
});

contextBridge.exposeInMainWorld("clipboxDesktop", desktopBridge);
