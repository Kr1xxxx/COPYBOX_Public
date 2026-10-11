// Stands in for Electron's preload: gives the page the same window.clipboxDesktop object.
(function () {
  var tauri = window.__TAURI__;
  var platform = "__PLATFORM__";
  var noop = function () {};
  // Rust commands reject with a plain string; the page (written for Electron) reads error.message.
  var invoke = function (name, args) {
    return tauri.core.invoke(name, args).catch(function (error) { throw error instanceof Error ? error : new Error(String(error)); });
  };
  var fireAndForget = function (name, args) { invoke(name, args).catch(noop); };

  window.clipboxDesktop = {
    platform: platform,
    copyText: function (text) { return tauri.clipboardManager.writeText(text); },
    copyImage: function (png) { return tauri.clipboardManager.writeImage(png); },
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

  document.addEventListener("DOMContentLoaded", function () {
    document.documentElement.classList.add("desktop-app", "platform-" + platform);
    watchIdle();
  }, { once: true });

  // Show the window once the page has painted, so it never opens as a white flash.
  window.addEventListener("load", function () {
    requestAnimationFrame(function () { requestAnimationFrame(function () { fireAndForget("page_ready"); }); });
  }, { once: true });
})();
