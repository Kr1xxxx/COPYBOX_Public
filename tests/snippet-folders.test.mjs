import assert from "node:assert/strict";
import test from "node:test";
import {
  STANDARD_SNIPPET_FOLDERS,
  normalizeImportedSnippetFolder,
  requireStandardSnippetFolder,
} from "../app/snippet-folders.ts";

test("returns the seven snippet folders in customer-flow order", () => {
  assert.deepEqual([...STANDARD_SNIPPET_FOLDERS], [
    "询盘接待",
    "产品样品",
    "报价成交",
    "定制生产",
    "客户跟进",
    "物流清关",
    "售后争议",
  ]);
});

test("maps every retired spreadsheet directory to one standard directory", () => {
  const cases = {
    开发: "询盘接待",
    需求: "询盘接待",
    产品: "产品样品",
    样品: "产品样品",
    库存: "产品样品",
    报价: "报价成交",
    下单: "报价成交",
    定制: "定制生产",
    生产: "定制生产",
    跟进: "客户跟进",
    维护: "客户跟进",
    物流: "物流清关",
    售后: "售后争议",
  };

  for (const [legacy, expected] of Object.entries(cases)) {
    assert.equal(normalizeImportedSnippetFolder(legacy), expected);
  }
});

test("accepts exact standard folders and rejects unknown near-synonyms", () => {
  assert.equal(requireStandardSnippetFolder(" 物流清关 "), "物流清关");
  assert.throws(() => requireStandardSnippetFolder("客服"), /只能使用标准目录/);
  assert.equal(normalizeImportedSnippetFolder("客服"), "");
});
