// Stands in for Electron's preload: gives the page the same window.clipboxDesktop object.
(function () {
  var tauri = window.__TAURI__;
  var platform = "__PLATFORM__";
  var noop = function () {};
  // Rust commands reject with a plain string; the page (written for Electron) reads error.message.
  var invoke = function (name, args, options) {
    return tauri.core.invoke(name, args, options).catch(function (error) { throw error instanceof Error ? error : new Error(String(error)); });
  };
  var fireAndForget = function (name, args) { invoke(name, args).catch(noop); };

  window.clipboxDesktop = {
    platform: platform,
    copyText: function (text) { return tauri.clipboardManager.writeText(text); },
    copyImage: function (png) { return tauri.clipboardManager.writeImage(png); },
    // TinyPNG compression (D-037): the bytes go as the raw body, the key as a header; a failure is a reason word.
    compressImage: function (bytes, key) {
      return invoke("compress_image", bytes, { headers: { "x-tinify-key": key } })
        .then(function (buffer) { return { ok: true, bytes: new Uint8Array(buffer) }; })
        .catch(function (error) { return { ok: false, reason: String(error && error.message ? error.message : error) }; });
    },
    // How many TinyPNG keys the installer carries (from a CI secret); the page asks for them as "builtin:N".
    compressBuiltInCount: function () { return invoke("tinify_builtin_count").catch(function () { return 0; }); },
    // Automatic daily backup: the file bytes go as the raw body, the file name as a header (backup.rs keeps the newest seven).
    backupSave: function (name, bytes) { return invoke("backup_save", bytes, { headers: { "x-backup-name": name } }).then(noop); },
    backupList: function () { return invoke("backup_list"); },
    backupRead: function (name) { return invoke("backup_read", { name: name }).then(function (buffer) { return new Uint8Array(buffer); }); },
    // The backups' pictures, one shared file each in backups/images/ (D-043); same body/header shape as backupSave.
    backupImageSave: function (name, bytes) { return invoke("backup_image_save", bytes, { headers: { "x-backup-name": name } }).then(noop); },
    backupImageList: function () { return invoke("backup_image_list"); },
    backupImageRead: function (name) { return invoke("backup_image_read", { name: name }).then(function (buffer) { return new Uint8Array(buffer); }); },
    backupImagePrune: function (keep) { return invoke("backup_image_prune", { keep: keep }).then(noop); },
    didCopy: function () { fireAndForget("did_copy"); },
    setCloseBehavior: function (behavior) { fireAndForget("set_close_behavior", { behavior: behavior }); },
    setMiniHidePolicy: function (policy) { fireAndForget("set_mini_hide_policy", { policy: policy }); },
    getLaunchAtLogin: function () { return invoke("get_launch_at_login"); },
    setLaunchAtLogin: function (enabled) { return invoke("set_launch_at_login", { enabled: Boolean(enabled) }); },
    openDataFolder: function () { return invoke("open_data_folder"); },
    setTheme: function (theme) { fireAndForget("set_theme", { theme: theme }); },
    getVersion: function () { return tauri.app.getVersion(); },
    relaunch: function () { fireAndForget("relaunch"); },
    checkUpdate: function () { return invoke("check_update"); },
    openUpdate: function () { return invoke("open_update"); },
    // Downloads the new installer, checks it and installs it over this app (Windows, D-047); progress comes as events.
    installUpdate: function () { return invoke("install_update"); },
    onUpdateProgress: function (callback) {
      var stopped = false;
      var unlisten = null;
      tauri.event.listen("clipbox:update-progress", function (event) { if (!stopped) callback(event.payload); })
        .then(function (off) { if (stopped) off(); else unlisten = off; });
      return function () { stopped = true; if (unlisten) unlisten(); };
    },
    // The vault's device key in Windows Credential Manager (D-053); get resolves to null when none is stored yet.
    // The page only uses these on Windows; elsewhere the shell refuses them.
    deviceKeyGet: function () { return invoke("device_key_get"); },
    deviceKeySet: function (key) { return invoke("device_key_set", { key: key }).then(noop); },
    aiStatus: function () { return invoke("ai_status"); },
    aiSave: function (settings) { return invoke("ai_save", { settings: settings }); },
    aiClear: function () { return invoke("ai_clear"); },
    aiRequest: function (payload) { return invoke("ai_request", { payload: payload }); },
    getBuildTime: function () { return invoke("get_build_time"); },
    fetchSiteIcon: function (host) { return invoke("fetch_site_icon", { host: host }); },
    fetchSharedLibrary: function (url) { return invoke("fetch_shared_library", { url: url }); },
    flushDone: function () { fireAndForget("flush_done"); },
    onFlushRequest: function (callback) {
      var stopped = false;
      var unlisten = null;
      tauri.event.listen("clipbox:flush", function () { if (!stopped) callback(); })
        .then(function (off) { if (stopped) off(); else unlisten = off; });
      return function () { stopped = true; if (unlisten) unlisten(); };
    },
    onFocusSearch: function (callback) {
      var stopped = false;
      var unlisten = null;
      tauri.event.listen("clipbox:focus-search", function () { if (!stopped) callback(); })
        .then(function (off) { if (stopped) off(); else unlisten = off; });
      return function () { stopped = true; if (unlisten) unlisten(); };
    },
    onAutomationCommand: function (callback) {
      var stopped = false;
      var unlisten = null;
      tauri.event.listen("clipbox:automation-command", function (event) { if (!stopped) callback(event.payload); })
        .then(function (off) { if (stopped) off(); else unlisten = off; });
      return function () { stopped = true; if (unlisten) unlisten(); };
    },
    respondAutomationCommand: function (requestId, response) {
      fireAndForget("automation_response", { requestId: requestId, response: response });
    },
    automationReady: function () { fireAndForget("automation_ready"); },
    setPinned: function (pinned) { fireAndForget("set_pinned", { pinned: Boolean(pinned) }); },
    setWindowMode: function (mode) { fireAndForget("set_window_mode", { mode: mode === "mini" ? "mini" : "full" }); },
    onWindowMode: function (callback) {
      var stopped = false;
      var unlisten = null;
      tauri.event.listen("clipbox:window-mode", function (event) {
        if (!stopped) callback(event.payload === "mini" ? "mini" : "full");
      }).then(function (off) { if (stopped) off(); else unlisten = off; });
      // The window may already be in mini mode when the page starts listening.
      invoke("get_window_mode").then(function (mode) { if (!stopped) callback(mode === "mini" ? "mini" : "full"); }).catch(noop);
      return function () { stopped = true; if (unlisten) unlisten(); };
    }
  };

  // Quiet the animations while the window is at rest (same rule as the Electron preload).
  function watchIdle() {
    var idleDelay = 30000;
    var timer;
    var root = document.documentElement;
    function rest() { clearTimeout(timer); root.classList.add("clipbox-idle"); }
    function wake() {
      clearTimeout(timer);
      if (document.hidden || !document.hasFocus()) { rest(); return; }
      root.classList.remove("clipbox-idle");
      timer = setTimeout(rest, idleDelay);
    }
    window.addEventListener("focus", wake);
    window.addEventListener("blur", rest);
    document.addEventListener("visibilitychange", wake);
    ["pointerdown", "pointermove", "keydown", "wheel", "input"].forEach(function (name) {
      window.addEventListener(name, wake, { capture: true, passive: true });
    });
    wake();
  }

  // Tauri ignores the CSS drag region (macOS has no title bar): press on the top band to move the window,
  // double-click zooms it on macOS. Controls inside the band keep working.
  function watchTitleDrag() {
    var controls = "button, input, select, textarea, label, a, [role='button'], .drag-handle, .folder-drag-handle";
    document.addEventListener("mousedown", function (event) {
      if (event.button !== 0 || !event.target.closest || !event.target.closest(".drag-region") || event.target.closest(controls)) return;
      event.preventDefault();
      if (event.detail === 2 && platform === "darwin") invoke("plugin:window|toggle_maximize").catch(noop);
      else if (event.detail !== 2) invoke("plugin:window|start_dragging").catch(noop);
    });
  }

  // The browser's own page menu (refresh, print, ... with their key hints) and its keys have no place in the app (D-005).
  // Text fields keep the system menu, which is how people paste with the mouse.
  var browserKeys = ["f5", "f7", "f12"];
  var browserCtrlKeys = ["r", "p", "s", "u", "g", "j"];
  function blocksBrowserKey(event) {
    var key = String(event.key || "").toLowerCase();
    if (browserKeys.indexOf(key) >= 0) return true;
    if (event.ctrlKey && event.shiftKey && (key === "i" || key === "j" || key === "c" || key === "r")) return true;
    return (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && browserCtrlKeys.indexOf(key) >= 0 && platform !== "darwin";
  }
  function quietBrowserChrome() {
    document.addEventListener("contextmenu", function (event) {
      var target = event.target;
      var field = target && target.closest && target.closest("input, textarea, [contenteditable='true']");
      if (!field) event.preventDefault();
    }, true);
    document.addEventListener("keydown", function (event) {
      if (blocksBrowserKey(event)) event.preventDefault();
    }, true);
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.documentElement.classList.add("desktop-app", "platform-" + platform);
    watchIdle();
    watchTitleDrag();
    quietBrowserChrome();
  }, { once: true });

  // Show the window once the page has painted, so it never opens as a white flash.
  window.addEventListener("load", function () {
    requestAnimationFrame(function () { requestAnimationFrame(function () { fireAndForget("page_ready"); }); });
  }, { once: true });
})();
