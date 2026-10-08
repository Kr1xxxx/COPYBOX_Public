function desktopProfile(platform) {
  const windows = platform === "win32";
  return Object.freeze({
    platform: windows ? "win32" : "darwin",
    edition: windows ? "snippet-only" : "full",
    supportsSecrets: !windows,
    supportsExport: !windows,
    supportsAutomation: !windows,
    globalShortcut: windows ? "" : "Alt+Space",
    shortcutLabel: windows ? "" : "⌥ Space",
    nativeTitleBar: windows,
    templateTrayIcon: !windows,
  });
}

module.exports = { desktopProfile };
