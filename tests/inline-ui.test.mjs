import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readUiSource } from "./helpers/ui-source.mjs";

const page = readUiSource();
// BackupDialog, SnippetImportDialog and DeleteConfirmDialog live in app/dialogs.tsx; SnippetFill in app/fill-panel.tsx (split out of page.tsx).
const dialogs = fs.readFileSync(new URL("../app/dialogs.tsx", import.meta.url), "utf8");
const fillPanel = fs.readFileSync(new URL("../app/fill-panel.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const bridge = fs.readFileSync(new URL("../src-tauri/bridge.js", import.meta.url), "utf8");
const shellMain = fs.readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");

test("editing, filling variables and creating folders happen in place, not in popups", () => {
  assert.match(page, /className="inline-editor"/);
  assert.match(fillPanel, /function SnippetFill\b/);
  assert.match(fillPanel, /className="var-chip"/);
  assert.doesNotMatch(page, /function FolderDialog|function SnippetCopyDialog|className="editor-backdrop"|className="editor-dialog"/);
  assert.match(page, /className="directory-new"/);
  assert.match(page, /className=\{`native-row selected editing new-row/);
  // only reversible-free flows keep real dialogs
  assert.match(page, /function SettingsDialog/);
  for (const dialog of ["BackupDialog", "SnippetImportDialog", "DeleteConfirmDialog"]) assert.match(dialogs, new RegExp(`function ${dialog}`));
});

test("folders can be renamed, recoloured and deleted from the sidebar", () => {
  for (const label of ["重命名", "恢复自动颜色", "删除目录…"]) assert.match(page, new RegExp(label));
  assert.match(page, /CATEGORY_PALETTE\.map/);
  assert.match(page, /folderEditBlocker\(activeKind, folder\)/);
});

test("lists support bulk move and trash with one undo, plus search scope, highlight and recent", () => {
  assert.match(page, /role="toolbar" aria-label="批量操作"/);
  assert.match(page, /moveItemsToFolder\(current\.items, ids/);
  assert.match(page, /moveItemsToTrash\(current\.items, ids/);
  assert.match(page, /className="scope-switch"/);
  assert.match(page, /className="search-hit"/);
  assert.match(page, /最近使用/);
});

test("theme follows the system by default and can be forced, with dark tokens defined twice", () => {
  assert.match(page, /\["system", "light", "dark"\]|THEME_OPTIONS = \["system", "light", "dark"\]/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)/);
  assert.match(css, /:root\[data-theme="dark"\] \{/);
  assert.match(css, /--bg: #1c1b19/);
  assert.match(bridge, /setTheme: function \(theme\) \{ fireAndForget\("set_theme"/);
  assert.match(shellMain, /window_mode::set_theme/);
});

test("风格 清爽 is light only: one token block before the dark blocks, no dark 清爽 tokens, 主题 forced to 浅色 (D-050)", () => {
  assert.match(page, /STYLE_OPTIONS = \["classic", "fresh"\]/);
  assert.match(page, /const effective: ThemeChoice = style === "fresh" \? "light" : theme;/);
  const light = css.indexOf(':root[data-style="fresh"] {');
  const media = css.indexOf("@media (prefers-color-scheme: dark) {\n  :root:not([data-theme=\"light\"])");
  assert.ok(light > 0 && media > 0 && light < media, "清爽 tokens must come before the dark media block");
  assert.match(css, /:root\[data-style="fresh"\] \{[^}]*--bg: #f8fafc/);
  assert.equal(css.includes('[data-style="fresh"]:not([data-theme="light"])'), false, "no 跟随系统 dark 清爽 block");
  assert.equal(css.includes('[data-theme="dark"][data-style="fresh"]'), false, "no forced dark 清爽 block");
  assert.equal(css.includes("--bg: #14171c"), false);
});

test("settings show last backup time and open the data folder on desktop", () => {
  assert.match(page, /还没有导出过/);
  assert.match(page, /clipbox\.last-backup-at/);
  assert.match(page, /打开文件夹/);
  assert.match(bridge, /openDataFolder: function \(\) \{ return invoke\("open_data_folder"\)/);
  assert.match(shellMain, /shell::open_data_folder/);
});
