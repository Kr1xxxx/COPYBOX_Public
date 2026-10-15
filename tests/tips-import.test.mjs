import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COMPANY_TIPS } from "../app/company-tips.ts";
import { freshTipsState, importTips, readTipsState, tipsLibrary } from "../app/daily-tips.ts";
import { parseTipsDocument, tipsFromRows, withImportIds } from "../app/tips-doc.ts";

const sample = readFileSync(new URL("../docs/samples/tips-sample.md", import.meta.url), "utf8");

test("a Tips document imports with its highlight examples and source; a shipped title updates that tip", () => {
  const tips = withImportIds(parseTipsDocument(sample));
  assert.equal(tips.length, 2);
  assert.match(tips[0].id, /^M-/);
  assert.deepEqual(tips[0].examples, [{ good: true, text: "Hi lovely, may I have your name?" }, { good: false, text: "Dear customer" }]);
  assert.equal(tips[0].source, "示例数据");
  assert.equal(tips[1].id, COMPANY_TIPS.find((tip) => tip.title === "拿不准就叫 lovely").id);

  const first = importTips(freshTipsState(), tips);
  assert.deepEqual([first.added, first.updated, first.unchanged], [1, 1, 0]);
  const library = tipsLibrary(first.state);
  assert.equal(library.find((tip) => tip.id === tips[1].id).text, "导入时同名的 Tips 会更新, 不会重复.");
  assert.equal(library.at(-1).title, "示例: 先问名字");
  assert.equal(library.length, tipsLibrary(freshTipsState()).length + 1);

  const again = importTips(first.state, tips);
  assert.deepEqual([again.added, again.updated, again.unchanged], [0, 0, 2]);
  assert.equal(again.state.imported.length, 2);
});

test("imported tips survive a save and read back", () => {
  const { state } = importTips(freshTipsState(), withImportIds(parseTipsDocument(sample)));
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  storage.setItem("clipbox.tips.v1", JSON.stringify(state));
  assert.deepEqual(readTipsState(storage).imported, state.imported);
});

test("a Tips table needs 标题 and 内容; examples are one per line", () => {
  const tips = tipsFromRows([
    ["标题", "内容", "正确写法", "错误写法", "来源"],
    ["表格里的 Tip", "一句说明", "✅ Good one\nGood two", "Bad one", "表格"],
    ["", "没有标题的行跳过", "", "", ""],
  ]);
  assert.deepEqual(tips, [{ id: "", title: "表格里的 Tip", text: "一句说明", examples: [{ good: true, text: "Good one" }, { good: true, text: "Good two" }, { good: false, text: "Bad one" }], source: "表格" }]);
  assert.throws(() => tipsFromRows([["标题"], ["x"]]), /缺少列：内容/);
});
