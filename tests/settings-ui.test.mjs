import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("settings is a full panel covering data, security, trash, window, AI and about (no shortcut list)", () => {
  for (const heading of ["数据", "安全", "回收站", "窗口", "AI", "关于"]) assert.match(page, new RegExp(`>${heading}</h3>`));
  assert.doesNotMatch(page, />快捷键<\/h3>/);
  assert.doesNotMatch(page, />命令行<\/h3>/);
  assert.doesNotMatch(page, /自动清除剪贴板|CLIPBOARD_CLEAR/);
  assert.doesNotMatch(page, /CLI_COMMANDS|macOS|Finder|⌥Space/);
  for (const label of ["导出话术备份", "导入备份", "导入话术表格", "重新加载", "迷你模式"]) assert.match(page, new RegExp(label));
  assert.match(page, /role="dialog" aria-modal="true" aria-labelledby="settings-title"/);
});

test("settings shows the version and the editor uses 备注 with AI 润色 / AI 整理 on the content", () => {
  assert.match(page, /Clipbox \{version \? `v\$\{version\}`/);
  assert.match(page, /AI 润色/);
  assert.match(page, /AI 整理/);
  assert.doesNotMatch(page, /AI 总结/);
  assert.doesNotMatch(page, /<label htmlFor="summary-input">\{structured \? "核心动作" : "总结"/);
});

test("the secrets section is called 备注 on Windows and 秘密 on macOS", () => {
  assert.match(page, /const SECRET_WORD = .*platform === "darwin" \? "秘密" : "备注"/);
  assert.match(page, /\{kind === "snippet" \? "话术" : SECRET_WORD\}/);
});
