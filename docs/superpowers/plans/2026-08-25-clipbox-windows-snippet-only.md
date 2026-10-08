# Clipbox Windows Snippet-Only Edition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows 10/11 x64 NSIS installer for a snippet-only Clipbox edition while leaving the existing macOS full edition unchanged.

**Architecture:** Keep one React/Electron codebase and the existing dual-kind encrypted vault model. A pure edition-policy module filters Windows data at load, import, and persistence boundaries; a pure desktop-platform profile exposes immutable capabilities through preload, and the renderer uses those capabilities to remove secret and export functionality only on Windows.

**Tech Stack:** TypeScript 5.9, React 19, browser Web Crypto/localStorage, Node test runner, Electron 37, electron-builder 26, NSIS.

**Spec:** `docs/superpowers/specs/2026-08-25-clipbox-windows-snippet-only-design.md`

## Global Constraints

- macOS must retain the current “秘密 + 话术” UI, encrypted vault behavior, import/export behavior, shortcut, tray, and packaging flow.
- Windows must expose only snippets and must never display, create, persist, or export secrets.
- Windows starts with no seeded content and accepts only the existing encrypted Clipbox JSON backup format plus manual entry.
- A mixed backup imports only snippets and reports the count of skipped secrets.
- A backup containing zero snippets must not clear or overwrite the current Windows vault, including in replace mode.
- Windows export is completely disabled, including for snippets created or edited on Windows.
- Deliver Windows 10/11 x64 as an NSIS `.exe`; do not produce a portable or ARM64 build.
- Reuse the current Clipbox brand artwork; do not redesign the icon or interface.
- Preserve unrelated tracked and untracked workspace files.

---

### Task 1: Pure edition and vault policy

**Files:**
- Create: `app/clipbox-edition.ts`
- Create: `tests/clipbox-edition.test.mjs`

**Interfaces:**
- Consumes: `VaultData`, `ImportStrategy`, `ItemKind`, and `mergeImportedVaultData` from `app/clipbox-core.ts`.
- Produces: `ClipboxEdition`, `ClipboxCapabilities`, `FULL_CAPABILITIES`, `viewPolicyForEdition(edition)`, `filterVaultForEdition(data, edition)`, and `prepareImportForEdition(current, incoming, strategy, edition, createId)`.

- [ ] **Step 1: Write failing policy tests**

Create fixtures containing one legacy secret, one explicit secret, two snippets, secret folders, and snippet folders. Assert:

```js
assert.deepEqual(viewPolicyForEdition("full"), {
  defaultKind: "secret",
  showKindSwitcher: true,
  showExport: true,
  sidebarTitle: "",
});
assert.deepEqual(viewPolicyForEdition("snippet-only"), {
  defaultKind: "snippet",
  showKindSwitcher: false,
  showExport: false,
  sidebarTitle: "话术库",
});

const filtered = filterVaultForEdition(mixedVault, "snippet-only");
assert.deepEqual(filtered.data.items.map((item) => item.id), ["snippet-1", "snippet-2"]);
assert.deepEqual(filtered.data.folders, { secret: [], snippet: ["客服", "物流"] });
assert.equal(filtered.skippedSecretCount, 2);

const emptyReplace = prepareImportForEdition(
  currentSnippetVault,
  secretOnlyVault,
  "replace",
  "snippet-only",
  () => "fresh-id",
);
assert.equal(emptyReplace.shouldPersist, false);
assert.deepEqual(emptyReplace.data, currentSnippetVault);
assert.equal(emptyReplace.skippedSecretCount, 1);
```

Also assert that the full edition returns the original normalized data, preserves empty replace behavior, and never reports skipped secrets.

- [ ] **Step 2: Run the policy test and verify RED**

Run: `node --test tests/clipbox-edition.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `app/clipbox-edition.ts`.

- [ ] **Step 3: Implement the minimal edition policy**

Create the module with these exact public shapes:

```ts
import {
  mergeImportedVaultData,
  normalizeVaultData,
  type ImportStrategy,
  type ItemKind,
  type VaultData,
} from "./clipbox-core";

export type ClipboxEdition = "full" | "snippet-only";

export type ClipboxCapabilities = {
  edition: ClipboxEdition;
  platform: "browser" | "darwin" | "win32";
  supportsSecrets: boolean;
  supportsExport: boolean;
  globalShortcut: string;
};

export const FULL_CAPABILITIES: ClipboxCapabilities = {
  edition: "full",
  platform: "browser",
  supportsSecrets: true,
  supportsExport: true,
  globalShortcut: "",
};

export function viewPolicyForEdition(edition: ClipboxEdition): {
  defaultKind: ItemKind;
  showKindSwitcher: boolean;
  showExport: boolean;
  sidebarTitle: string;
} {
  return edition === "snippet-only"
    ? { defaultKind: "snippet", showKindSwitcher: false, showExport: false, sidebarTitle: "话术库" }
    : { defaultKind: "secret", showKindSwitcher: true, showExport: true, sidebarTitle: "" };
}

export function filterVaultForEdition(data: VaultData, edition: ClipboxEdition) {
  const normalized = normalizeVaultData(data);
  if (edition === "full") return { data: normalized, skippedSecretCount: 0 };
  const items = normalized.items.filter((item) => item.kind === "snippet");
  return {
    data: normalizeVaultData({ items, folders: { secret: [], snippet: normalized.folders.snippet } }),
    skippedSecretCount: normalized.items.length - items.length,
  };
}

export function prepareImportForEdition(
  current: VaultData,
  incoming: VaultData,
  strategy: ImportStrategy,
  edition: ClipboxEdition,
  createId: () => string,
) {
  const safeCurrent = filterVaultForEdition(current, edition).data;
  const filteredIncoming = filterVaultForEdition(incoming, edition);
  if (edition === "snippet-only" && filteredIncoming.data.items.length === 0) {
    return {
      data: safeCurrent,
      importedCount: 0,
      skippedSecretCount: filteredIncoming.skippedSecretCount,
      shouldPersist: false,
    };
  }
  const merged = mergeImportedVaultData(safeCurrent, filteredIncoming.data, strategy, createId);
  return { ...merged, skippedSecretCount: filteredIncoming.skippedSecretCount, shouldPersist: true };
}
```

- [ ] **Step 4: Run the policy tests and verify GREEN**

Run: `node --test tests/clipbox-edition.test.mjs tests/clipbox-core.test.mjs`

Expected: all edition and existing core tests PASS.

- [ ] **Step 5: Commit the edition policy**

```bash
git add app/clipbox-edition.ts tests/clipbox-edition.test.mjs
git commit -m "feat: add Clipbox edition policy"
```

### Task 2: Desktop platform profile and secure capability bridge

**Files:**
- Create: `desktop/platform.cjs`
- Create: `tests/desktop-platform.test.mjs`
- Modify: `desktop/preload.cjs`
- Modify: `desktop/main.cjs`

**Interfaces:**
- Consumes: `process.platform` from the Electron main and preload processes.
- Produces: `desktopProfile(platform)` returning `platform`, `edition`, `supportsSecrets`, `supportsExport`, `globalShortcut`, `shortcutLabel`, `nativeTitleBar`, and `templateTrayIcon`; exposes the immutable renderer value `window.clipboxDesktop.capabilities`.

- [ ] **Step 1: Write failing desktop-profile tests**

```js
const windows = desktopProfile("win32");
assert.deepEqual(windows, {
  platform: "win32",
  edition: "snippet-only",
  supportsSecrets: false,
  supportsExport: false,
  globalShortcut: "CommandOrControl+Alt+Space",
  shortcutLabel: "Ctrl+Alt+Space",
  nativeTitleBar: true,
  templateTrayIcon: false,
});

const mac = desktopProfile("darwin");
assert.equal(mac.edition, "full");
assert.equal(mac.supportsSecrets, true);
assert.equal(mac.supportsExport, true);
assert.equal(mac.globalShortcut, "Alt+Space");
assert.equal(mac.shortcutLabel, "⌥ Space");
assert.equal(mac.nativeTitleBar, false);
assert.equal(mac.templateTrayIcon, true);
```

- [ ] **Step 2: Run the desktop-profile test and verify RED**

Run: `node --test tests/desktop-platform.test.mjs`

Expected: FAIL with `MODULE_NOT_FOUND` for `desktop/platform.cjs`.

- [ ] **Step 3: Implement `desktopProfile`**

```js
function desktopProfile(platform) {
  const windows = platform === "win32";
  return Object.freeze({
    platform: windows ? "win32" : "darwin",
    edition: windows ? "snippet-only" : "full",
    supportsSecrets: !windows,
    supportsExport: !windows,
    globalShortcut: windows ? "CommandOrControl+Alt+Space" : "Alt+Space",
    shortcutLabel: windows ? "Ctrl+Alt+Space" : "⌥ Space",
    nativeTitleBar: windows,
    templateTrayIcon: !windows,
  });
}

module.exports = { desktopProfile };
```

- [ ] **Step 4: Expose and consume the profile**

In `desktop/preload.cjs`, expose a frozen `capabilities` object alongside the existing IPC methods:

```js
const { desktopProfile } = require("./platform.cjs");
const profile = desktopProfile(process.platform);

contextBridge.exposeInMainWorld("clipboxDesktop", {
  capabilities: Object.freeze({
    edition: profile.edition,
    platform: profile.platform,
    supportsSecrets: profile.supportsSecrets,
    supportsExport: profile.supportsExport,
    globalShortcut: profile.shortcutLabel,
  }),
  didCopy: () => ipcRenderer.send("clipbox:did-copy"),
  onFocusSearch: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("clipbox:focus-search", listener);
    return () => ipcRenderer.removeListener("clipbox:focus-search", listener);
  },
});
```

In `desktop/main.cjs`, use the same profile to:

- retain `hiddenInset` and `trafficLightPosition` only on macOS;
- add `desktop-app platform-${profile.platform}` classes on `dom-ready`;
- call `setTemplateImage(true)` only for the macOS tray icon;
- render the platform shortcut label in the tooltip and tray menu;
- register `profile.globalShortcut` and continue startup even when `globalShortcut.register` returns `false`.

- [ ] **Step 5: Run desktop tests and syntax checks**

Run: `node --test tests/desktop-platform.test.mjs && node --check desktop/main.cjs && node --check desktop/preload.cjs`

Expected: all checks PASS.

- [ ] **Step 6: Commit the desktop platform layer**

```bash
git add desktop/platform.cjs desktop/preload.cjs desktop/main.cjs tests/desktop-platform.test.mjs
git commit -m "feat: add Windows desktop profile"
```

### Task 3: Wire snippet-only data flow and Windows UI

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/windows-snippet-ui.test.mjs`
- Create: `tests/fixtures/snippet-only-preload.cjs`
- Create: `tests/fixtures/electron-snippet-ui.cjs`

**Interfaces:**
- Consumes: `ClipboxCapabilities`, `FULL_CAPABILITIES`, `filterVaultForEdition`, `prepareImportForEdition`, and `viewPolicyForEdition` from Task 1; `window.clipboxDesktop.capabilities` from Task 2.
- Produces: a runtime-selected full macOS UI or snippet-only Windows UI with filtered load/persist/import behavior.

- [ ] **Step 1: Write the failing Electron UI smoke test**

Create a test preload that exposes snippet-only capabilities without changing production code:

```js
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("clipboxDesktop", {
  capabilities: Object.freeze({
    edition: "snippet-only",
    platform: "win32",
    supportsSecrets: false,
    supportsExport: false,
    globalShortcut: "Ctrl+Alt+Space",
  }),
  didCopy() {},
  onFocusSearch() { return () => {}; },
});
```

The Electron fixture must start `dist/standalone/server.js` on a free localhost port, load it in a hidden `BrowserWindow` with the fixture preload, wait until loading completes, and print this JSON from the live DOM:

```js
{
  text: document.body.innerText,
  hasKindSwitcher: Boolean(document.querySelector(".home-switch")),
  hasSnippetHeading: Boolean(document.querySelector(".snippet-edition-heading")),
  emptyActionLabels: Array.from(document.querySelectorAll(".snippet-empty-actions button"), (node) => node.textContent.trim()),
}
```

In `tests/windows-snippet-ui.test.mjs`, spawn the Electron fixture and assert:

```js
assert.equal(result.hasKindSwitcher, false);
assert.equal(result.hasSnippetHeading, true);
assert.deepEqual(result.emptyActionLabels, ["导入 Clipbox 备份", "新建话术"]);
assert.doesNotMatch(result.text, /秘密|导出安全备份/);
assert.match(result.text, /话术库|导入话术备份/);
```

- [ ] **Step 2: Run the UI smoke test and verify RED**

Run: `npm run build && node --test tests/windows-snippet-ui.test.mjs`

Expected: FAIL because the current UI still renders the kind switcher and has no Windows empty actions.

- [ ] **Step 3: Initialize and enforce the edition in the renderer**

In `app/page.tsx`:

- extend the desktop bridge declaration with `capabilities: ClipboxCapabilities`;
- store capabilities with `FULL_CAPABILITIES` as the browser/server-safe default;
- during `openVault`, read `window.clipboxDesktop?.capabilities`, set the default kind from `viewPolicyForEdition`, and filter opened data before committing it to state;
- run every `persist` payload through `filterVaultForEdition` before state updates and encryption;
- force new Windows entries and folders to `snippet` even if a stale event supplies another kind;
- guard `exportVault` with `capabilities.supportsExport`.

The persistence boundary must have this shape:

```ts
const synchronized = synchronizeVaultData(nextItems, nextFolders ?? foldersRef.current);
const data = filterVaultForEdition(synchronized, capabilities.edition).data;
```

- [ ] **Step 4: Apply edition-aware import behavior**

Replace the direct `mergeImportedVaultData` call in `applyImport` with `prepareImportForEdition`. When `shouldPersist` is false, keep the dialog open and report `备份中没有可导入的话术`; do not call `persist`. On success, use these messages:

```ts
const skipped = result.skippedSecretCount ? `，跳过 ${result.skippedSecretCount} 条秘密` : "";
setToast(`已导入 ${result.importedCount} 条话术${skipped}`);
```

Keep the existing full-edition import behavior and wording for macOS.

- [ ] **Step 5: Render the Windows-only presentation**

Use `viewPolicyForEdition(capabilities.edition)` to render:

- `.snippet-edition-heading` with “话术库” and the snippet count instead of `.home-switch`;
- a direct “导入话术备份” sidebar button instead of the full settings dropdown;
- `.snippet-empty-actions` with “导入 Clipbox 备份” and “新建话术” only when the Windows snippet vault is empty and there is no search query;
- the existing no-results message when a Windows search has no matches;
- `ItemEditor` and `FolderDialog` with `kind="snippet"` for the snippet-only edition;
- the existing full-edition JSX unchanged behind the full-edition policy flags.

Add `.platform-win32` CSS to hide the application’s internal titlebar, make `.vault-view` full-height, and reset modal top insets. Add compact styling for the snippet heading and empty action buttons without changing macOS selectors.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm run build && node --test tests/clipbox-edition.test.mjs tests/clipbox-core.test.mjs tests/desktop-platform.test.mjs tests/windows-snippet-ui.test.mjs`

Expected: all tests PASS; the live snippet-only DOM contains no secret or export controls.

- [ ] **Step 7: Commit the Windows renderer behavior**

```bash
git add app/page.tsx app/globals.css tests/windows-snippet-ui.test.mjs tests/fixtures/snippet-only-preload.cjs tests/fixtures/electron-snippet-ui.cjs
git commit -m "feat: add Windows snippet-only interface"
```

### Task 4: Windows icon, NSIS configuration, and documentation

**Files:**
- Create: `desktop/assets/Clipbox.ico`
- Create: `tests/windows-package.test.mjs`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: `desktop/assets/Clipbox.png` and `dist/desktop-standalone`.
- Produces: `npm run desktop:pack:win` and electron-builder `win`/`nsis` configuration for a per-user x64 NSIS installer.

- [ ] **Step 1: Write the failing package configuration test**

Parse `package.json` and assert:

```js
assert.equal(pkg.scripts["desktop:pack"], pkg.scripts["desktop:pack:mac"]);
assert.match(pkg.scripts["desktop:pack:win"], /electron-builder --win nsis --x64/);
assert.equal(pkg.build.win.icon, "desktop/assets/Clipbox.ico");
assert.deepEqual(pkg.build.win.target, [{ target: "nsis", arch: ["x64"] }]);
assert.equal(pkg.build.nsis.oneClick, true);
assert.equal(pkg.build.nsis.perMachine, false);
assert.equal(pkg.build.nsis.createStartMenuShortcut, true);
assert.equal(pkg.build.nsis.createDesktopShortcut, true);
assert.equal(pkg.build.nsis.artifactName, "Clipbox-Setup-${version}-${arch}.${ext}");
```

- [ ] **Step 2: Run the package test and verify RED**

Run: `node --test tests/windows-package.test.mjs`

Expected: FAIL because the Windows script and builder configuration do not exist.

- [ ] **Step 3: Generate the Windows icon from approved artwork**

Use Pillow only for mechanical format conversion, preserving the source aspect ratio:

```bash
python3 -c 'from PIL import Image; image=Image.open("desktop/assets/Clipbox.png").convert("RGBA"); image.save("desktop/assets/Clipbox.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])'
```

Verify: `file desktop/assets/Clipbox.ico`

Expected: a Microsoft Windows icon containing multiple sizes.

- [ ] **Step 4: Add Windows scripts and NSIS configuration**

Keep `desktop:pack` as the macOS-compatible alias and add:

```json
"desktop:pack:mac": "npm run build && node desktop/prepare-standalone.mjs && electron-builder --mac dir --arm64",
"desktop:pack:win": "npm run build && node desktop/prepare-standalone.mjs && electron-builder --win nsis --x64"
```

Add this builder configuration without changing the existing `mac` block:

```json
"win": {
  "icon": "desktop/assets/Clipbox.ico",
  "target": [{ "target": "nsis", "arch": ["x64"] }]
},
"nsis": {
  "oneClick": true,
  "perMachine": false,
  "createStartMenuShortcut": true,
  "createDesktopShortcut": true,
  "shortcutName": "Clipbox",
  "artifactName": "Clipbox-Setup-${version}-${arch}.${ext}"
}
```

- [ ] **Step 5: Document platform-specific behavior**

In `README.md`, retain the macOS section and add a Windows section containing:

````md
## Windows 桌面应用

```bash
npm run desktop:pack:win
```

安装包输出到 `release/Clipbox-Setup-0.1.0-x64.exe`。Windows 版只提供话术，首次启动为空；可以导入 Clipbox 加密 JSON 备份或手动新增，但不提供任何导出功能。
````

Update shortcut documentation so macOS remains `⌥ Space` and Windows is `Ctrl+Alt+Space`. Explicitly warn that Windows-created data cannot be exported and should not be treated as recoverable after application data deletion.

- [ ] **Step 6: Run package tests and JSON validation**

Run: `node --test tests/windows-package.test.mjs && node -e 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8"))'`

Expected: PASS.

- [ ] **Step 7: Commit packaging and documentation**

```bash
git add desktop/assets/Clipbox.ico tests/windows-package.test.mjs package.json README.md
git commit -m "build: add Windows NSIS installer"
```

### Task 5: Full verification and Windows artifact

**Files:**
- Modify only if verification exposes a scoped defect in files from Tasks 1–4.
- Verify artifact: `release/Clipbox-Setup-0.1.0-x64.exe`
- Verify unpacked application: `release/win-unpacked/Clipbox.exe`

**Interfaces:**
- Consumes: all implementation and build scripts from Tasks 1–4.
- Produces: verified tests/builds and a Windows x64 installer artifact.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: build succeeds and every `tests/*.test.mjs` test passes.

- [ ] **Step 2: Run lint and syntax checks**

Run: `npm run lint && node --check desktop/main.cjs && node --check desktop/preload.cjs && node --check desktop/platform.cjs`

Expected: no errors.

- [ ] **Step 3: Build the macOS regression artifact**

Run: `npm run desktop:pack:mac`

Expected: `release/mac-arm64/Clipbox.app` is regenerated successfully with the existing full edition profile.

- [ ] **Step 4: Build the Windows installer**

Run: `npm run desktop:pack:win`

Expected: electron-builder completes successfully and produces `release/Clipbox-Setup-0.1.0-x64.exe` plus `release/win-unpacked/Clipbox.exe`.

- [ ] **Step 5: Inspect artifact identity and contents**

Run:

```bash
file release/Clipbox-Setup-0.1.0-x64.exe release/win-unpacked/Clipbox.exe
test -f release/win-unpacked/resources/app.asar
test -f release/win-unpacked/resources/standalone/.runtime-id
shasum -a 256 release/Clipbox-Setup-0.1.0-x64.exe
```

Expected: both executables identify as Windows PE files, the packaged app and standalone runtime exist, and a SHA-256 checksum is printed for delivery.

- [ ] **Step 6: Inspect the UI at common window sizes**

Run the Electron snippet-only smoke fixture visibly at 680×620 and 500×520. Confirm the heading, directories, empty actions, editor, import dialog, and native-titlebar spacing do not overlap or clip. Do not inspect or print localStorage, device keys, passwords, or encrypted vault values.

- [ ] **Step 7: Record the Windows-native verification boundary**

If the installer cannot be executed on this macOS host, report that installation, native tray behavior, and Windows shortcut registration require one final Windows 10/11 smoke test. Do not claim those three behaviors were executed locally; distinguish the generated-and-inspected `.exe` from Windows-native runtime verification.

- [ ] **Step 8: Commit any verification-only scoped fixes**

If Steps 1–6 required changes, stage only the affected files from Tasks 1–4 and commit:

```bash
git commit -m "fix: complete Windows edition verification"
```

If no files changed, do not create an empty commit.
