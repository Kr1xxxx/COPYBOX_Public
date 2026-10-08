const { contextBridge } = require("electron");

if (process.env.CLIPBOX_TEST_SEED_LEGACY === "1") {
  localStorage.setItem("clipbox.legacy-vault.v1", "sensitive-legacy-data");
}

const seededVault = process.env.CLIPBOX_TEST_CURRENT_VAULT;
if (seededVault && process.env.CLIPBOX_TEST_DEVICE_KEY) {
  localStorage.setItem("clipbox.vault.v1", seededVault);
  localStorage.setItem("clipbox.device-key.v1", process.env.CLIPBOX_TEST_DEVICE_KEY);
}

contextBridge.exposeInMainWorld("clipboxTest", {
  currentVaultWasRewritten: () => seededVault
    ? localStorage.getItem("clipbox.vault.v1") !== seededVault
    : false,
});

contextBridge.exposeInMainWorld("clipboxDesktop", {
  capabilities: Object.freeze({
    edition: "snippet-only",
    platform: "win32",
    supportsSecrets: false,
    supportsExport: false,
    supportsAutomation: false,
    globalShortcut: "",
  }),
  didCopy() {},
  onFocusSearch() { return () => {}; },
});

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("desktop-app", "platform-win32");
});
