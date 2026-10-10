// Stands in for Electron's preload: gives the page the same window.clipboxDesktop object.
// Step 1 only covers copying and the version; the other calls are quiet no-ops until their own step.
(function () {
  var tauri = window.__TAURI__;
  var platform = "__PLATFORM__";
  var noop = function () {};
  window.clipboxDesktop = {
    platform: platform,
    copyText: function (text) { return tauri.clipboardManager.writeText(text); },
    copyImage: function (png) { return tauri.clipboardManager.writeImage(png); },
    didCopy: noop,
    getVersion: function () { return tauri.app.getVersion(); },
    relaunch: function () { location.reload(); },
    onFocusSearch: function () { return noop; },
    onAutomationCommand: function () { return noop; },
    respondAutomationCommand: noop,
    automationReady: noop
  };
  document.addEventListener("DOMContentLoaded", function () {
    document.documentElement.classList.add("desktop-app", "platform-" + platform);
  });
})();
