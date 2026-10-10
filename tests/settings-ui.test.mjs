import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readUiSource } from "./helpers/ui-source.mjs";

const page = readUiSource();
// The AI settings panel and the AI request code live in their own files (split out of page.tsx).
const aiSettings = fs.readFileSync(new URL("../app/ai-settings.tsx", import.meta.url), "utf8");
const aiClient = fs.readFileSync(new URL("../app/ai-client.ts", import.meta.url), "utf8");

test("settings is a full panel covering data, security, trash, window, AI and about (no shortcut list)", () => {
  for (const heading of ["数据", "目录", "安全", "回收站", "窗口", "AI", "关于"]) assert.match(page, new RegExp(`>${heading}</h3>`));
  assert.doesNotMatch(page, />快捷键<\/h3>/);
  assert.doesNotMatch(page, />命令行<\/h3>/);
  assert.doesNotMatch(page, /自动清除剪贴板|CLIPBOARD_CLEAR/);
  assert.doesNotMatch(page, /CLI_COMMANDS|macOS|Finder|⌥Space/);
  for (const label of ["导出话术备份", "导入备份", "导入话术表格", "重新加载", "迷你模式"]) assert.match(page, new RegExp(label));
  assert.match(page, /role="dialog" aria-modal="true" aria-labelledby="settings-title"/);
});

test("settings shows the version and the editor calls the snippet note 小提示 with AI 润色 / AI 整理 on the content", () => {
  assert.match(page, /\{structured \? "核心动作" : "小提示"\}/);
  assert.doesNotMatch(page, /: "备注"\} \{!structured/);
  assert.match(page, /Clipbox \{version \? `v\$\{version\}`/);
  assert.match(page, /AI 润色/);
  assert.match(page, /AI 整理/);
  assert.doesNotMatch(page, /AI 总结/);
  assert.doesNotMatch(page, /<label htmlFor="summary-input">\{structured \? "核心动作" : "总结"/);
});

test("the secrets section is called 备注 on Windows and 秘密 on macOS", () => {
  assert.match(page, /const SECRET_WORD = .*platform === "darwin" \? "秘密" : "备注"/);
  assert.match(page, /label: kind === "snippet" \? "话术" : SECRET_WORD/);
});

test("settings can create, rename, recolour, reorder and delete folders for both kinds", () => {
  assert.match(page, /<SettingsFolders groups=\{folderGroups\}/);
  for (const fn of ["settingsFolderAdd", "settingsFolderRename", "settingsFolderDelete", "settingsFolderColor", "settingsFolderMove"]) assert.match(page, new RegExp(`function ${fn}\\(`));
  assert.match(page, /data-local-esc/);
  assert.match(page, /标准话术目录不能改名或删除/);
});

test("settings keeps typing focus: close button is focused once, onClose lives in a ref", () => {
  assert.match(page, /const onCloseRef = useRef\(onClose\)/);
  assert.match(page, /useEffect\(\(\) => \{ closeRef\.current\?\.focus\(\); \}, \[\]\);/);
});

const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("settings folders can be dragged as well as moved with the arrow buttons", () => {
  assert.match(page, /scope: "settings-folder"/);
  assert.match(page, /className="settings-folder-grip"[^>]*onPointerDown=\{\(event\) => reorder\.beginPointerDrag\(event, key\)\}/);
  assert.match(page, /folder\.locked \|\| !group\.sortable \? \{\} : \{ "data-sort-scope": "settings-folder"/, "standard folders and image folders (no saved order) are neither draggable nor drop targets");
  assert.match(page, /onMove=\{onFolderMove\} onReorder=\{onFolderReorder\}/);
  assert.match(page, /document\.querySelector\("\.settings-folder\.dragging"\)/, "Esc cancels the drag, not the dialog");
  assert.match(css, /\.settings-folder\.dragging/);
});

test("the card that loses the selection folds away instead of vanishing", () => {
  assert.match(page, /closingIds/);
  assert.match(page, /row-detail \$\{closing \? "closing" : ""\}/);
  assert.match(page, /inert=\{closing\}/);
  assert.match(css, /\.row-detail\.closing\s*\{[^}]*detail-close/);
  assert.match(css, /@keyframes detail-close/);
});

test("variables are highlighted blocks typed in place: the copy bar is the card's own row-actions, no fill page", () => {
  assert.match(css, /\.var-chip\s*\{/);
  assert.doesNotMatch(css, /\.fill-actions|\.fill-panel/);
  assert.doesNotMatch(page, /SnippetFillPanel|prepareCopy|填写变量/);
});

test("the status bar no longer mentions clearing the clipboard", () => {
  assert.doesNotMatch(page, /清理剪贴板/);
});

test("on Windows the 备注 section is plain notes: no masking, reference links or segments", () => {
  assert.match(page, /const PLAIN_NOTES = typeof window === "undefined" \|\| window\.clipboxDesktop\?\.platform !== "darwin"/);
  for (const marker of ['!isSnippet && !PLAIN_NOTES && <button type="button" className="native-reference"', 'kind === "secret" && !PLAIN_NOTES && item && <button', 'kind === "secret" && !PLAIN_NOTES && <label className="native-field reference-note-field"', 'kind === "secret" && !PLAIN_NOTES && <ArcSegmented className="segmented"', '!isSnippet && !PLAIN_NOTES && <p className="row-hint"']) {
    assert.ok(page.includes(marker), marker);
  }
  assert.match(page, /: PLAIN_NOTES \? <p className="row-content">/);
});

test("settings → AI lets people enter their own interface, key and prompts, and blocks empty prompts", () => {
  assert.match(aiSettings, /function AiSettingsSection\(/);
  for (const label of ["接口地址", "润色提示词", "整理提示词", "API Key", "恢复默认提示词", "保存并测试", "停用并清除"]) assert.ok(aiSettings.includes(label), label);
  assert.match(aiSettings, /disabled=\{Boolean\(problem\) \|\| Boolean\(busy\)\}>\{busy === "save"/);
  assert.match(aiSettings, /const problem = validateAiSettings\(form, keyReady\)/);
  assert.match(aiClient, /aiRequest\(\{ url, body \}\)/);
});

test("settings → AI offers common-service presets and can list the models of the account", () => {
  assert.match(aiSettings, /AI_PRESETS\.map\(\(preset\) => <option key=\{preset\.id\}/);
  assert.match(aiSettings, /function applyPreset\(/);
  assert.match(aiSettings, /获取模型/);
  assert.match(aiSettings, /list="ai-model-choices"/);
});

test("no fake title-bar band, drag regions or missing fonts off Mac", () => {
  assert.doesNotMatch(page, /ALT_KEY_WORD|按 Option|按 Alt/);
  assert.match(css, /\.desktop-app:not\(\.platform-darwin\) \.sidebar-top \.traffic-lights \{ display: none; \}/);
  assert.match(css, /\.desktop-app:not\(\.platform-darwin\) \.drag-region \{ -webkit-app-region: no-drag; \}/);
  assert.match(css, /--font-sans:[^;]*"Segoe UI"[^;]*"Microsoft YaHei UI"/);
});

test("there are no keyboard-shortcut hints or modifier shortcuts anywhere", () => {
  assert.doesNotMatch(page, /<kbd|<Keys|function Keys|homeShortcutAction|handleCardSortKey|handleFolderSortKey/);
  assert.doesNotMatch(page, /event\.(metaKey|ctrlKey)/);
  assert.doesNotMatch(css, /(^|\n)kbd \{|\.k-mac|\.k-win|\.enter-key/);
  const main = fs.readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");
  assert.doesNotMatch(main, /globalShortcut|GLOBAL_HOTKEY|accelerator/);
});

test("settings → 目录: each group folds open on click and 图片目录 can be edited there", () => {
  assert.match(page, /<ArcCollapsible className="settings-folder-group"/);
  const collapsible = fs.readFileSync(new URL("../app/arc/collapsible.tsx", import.meta.url), "utf8");
  assert.match(collapsible, /defaultOpen = false/, "collapsed by default");
  assert.match(collapsible, /aria-expanded=\{open\}/);
  assert.match(page, /title: "图片目录"/);
  assert.match(page, /useImageLibrary\(deviceKey, imageView \|\| settingsOpen, flashToast\)/);
});

test("deleted items are cleared after 7 days until another option is picked", () => {
  assert.match(page, /readStoredChoice<number>\(TRASH_DAYS_KEY, TRASH_DAY_OPTIONS, DEFAULT_TRASH_DAYS\)/);
  const preferences = fs.readFileSync(new URL("../app/preferences.ts", import.meta.url), "utf8");
  assert.match(preferences, /export const DEFAULT_TRASH_DAYS = 7;/);
});
