import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { desktopProfile } = require("../desktop/platform.cjs");

test("uses the snippet-only profile on Windows", () => {
  assert.deepEqual(desktopProfile("win32"), {
    platform: "win32",
    edition: "snippet-only",
    supportsSecrets: false,
    supportsExport: false,
    supportsAutomation: false,
    globalShortcut: "",
    shortcutLabel: "",
    nativeTitleBar: true,
    templateTrayIcon: false,
  });
});

test("preserves the full desktop profile on macOS", () => {
  assert.deepEqual(desktopProfile("darwin"), {
    platform: "darwin",
    edition: "full",
    supportsSecrets: true,
    supportsExport: true,
    supportsAutomation: true,
    globalShortcut: "Alt+Space",
    shortcutLabel: "⌥ Space",
    nativeTitleBar: false,
    templateTrayIcon: true,
  });
});
