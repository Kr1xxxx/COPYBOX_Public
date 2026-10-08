import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("settings is a full panel covering data, security, trash, window, CLI and about (no shortcut list)", () => {
  for (const heading of ["数据", "安全", "回收站", "窗口", "命令行", "关于"]) assert.match(page, new RegExp(`>${heading}</h3>`));
  assert.doesNotMatch(page, />快捷键<\/h3>/);
  for (const label of ["导出话术备份", "导入备份", "导入话术表格", "重新加载", "复制后自动清除剪贴板", "迷你模式"]) assert.match(page, new RegExp(label));
  assert.match(page, /role="dialog" aria-modal="true" aria-labelledby="settings-title"/);
});
