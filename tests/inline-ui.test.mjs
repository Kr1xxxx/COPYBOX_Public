import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
// BackupDialog and SnippetImportDialog live in app/dialogs.tsx (split out of page.tsx).
const dialogs = fs.readFileSync(new URL("../app/dialogs.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");
const preload = fs.readFileSync(new URL("../desktop/preload.cjs", import.meta.url), "utf8");

test("editing, filling variables and creating folders happen in place, not in popups", () => {
  assert.match(page, /className="inline-editor"/);
  assert.match(page, /function SnippetFillPanel/);
  assert.doesNotMatch(page, /function FolderDialog|function SnippetCopyDialog|className="editor-backdrop"|className="editor-dialog"/);
  assert.match(page, /className="directory-new"/);
  assert.match(page, /className=\{`native-row selected editing new-row/);
  // only reversible-free flows keep real dialogs
  for (const dialog of ["DeleteConfirmDialog", "SettingsDialog"]) assert.match(page, new RegExp(`function ${dialog}`));
  for (const dialog of ["BackupDialog", "SnippetImportDialog"]) assert.match(dialogs, new RegExp(`function ${dialog}`));
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

test("first run offers onboarding actions", () => {
  assert.match(page, /className="native-empty onboarding"/);
  for (const label of ["新增第一条", "导入话术表格", "导入备份"]) assert.match(page, new RegExp(label));
});

test("theme follows the system by default and can be forced, with dark tokens defined twice", () => {
  assert.match(page, /\["system", "light", "dark"\]|THEME_OPTIONS = \["system", "light", "dark"\]/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)/);
  assert.match(css, /:root\[data-theme="dark"\] \{/);
  assert.match(css, /--bg: #1c1b19/);
  assert.match(preload, /setTheme/);
  assert.match(main, /nativeTheme\.themeSource = theme/);
});

test("settings show last backup time and open the data folder on desktop", () => {
  assert.match(page, /还没有导出过/);
  assert.match(page, /clipbox\.last-backup-at/);
  assert.match(page, /打开文件夹/);
  assert.match(preload, /openDataFolder/);
  assert.match(main, /shell\.openPath\(app\.getPath\("userData"\)\)/);
  assert.match(main, /webContents !== event\.sender\) throw/);
});
