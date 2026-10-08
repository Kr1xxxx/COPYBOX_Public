import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  buildSnippetImportPreview,
  extractPlaceholders,
  fillSnippetTemplate,
  matchesSnippetProduct,
  normalizeSnippetRow,
  parseSnippetWorkbook,
  hasOptionalSnippetPreparation,
  resolveSnippetCopySource,
  snippetCopyReadiness,
  snippetSearchText,
} from "../app/snippet-import.ts";

const baseRow = {
  标题: "报价－首次报价－发送睫毛报价",
  沟通阶段: "报价",
  具体场景: "首次报价",
  核心动作: "发送睫毛报价",
  "产品/业务": "睫毛/包装/Logo",
  搜索关键词: "派生字段不应持久化",
  英文即时消息: "Hi [Customer Name], the price is USD 10.",
  中文对照: "您好 [Customer Name]，价格是 10 美元。",
  可替换变量: "[Customer Name], [Price]",
  使用备注: "发送前核实金额",
  优先级: "高",
};

test("extracts unique bracket placeholders across repeated text", () => {
  assert.deepEqual(
    extractPlaceholders("Hi [Customer Name], [Customer Name]. 你好 [客户姓名]"),
    ["Customer Name", "客户姓名"],
  );
});

test("normalizes workbook semantics without treating declared inputs as placeholders", () => {
  const result = normalizeSnippetRow(baseRow, 2);
  assert.equal(result.error, "");
  assert.equal(result.item.label, "首次报价");
  assert.equal(result.item.folder, "报价成交");
  assert.equal(result.item.snippetMeta.stage, "报价成交");
  assert.equal(result.item.summary, "发送睫毛报价");
  assert.deepEqual(result.item.snippetMeta.productGroups, ["睫毛", "包装/Logo"]);
  assert.deepEqual(result.item.snippetMeta.placeholders, ["Customer Name"]);
  assert.deepEqual(result.item.snippetMeta.requiredInputs, ["Price"]);
  assert.equal(result.item.snippetMeta.requiresVerification, true);
  assert.equal(result.item.snippetMeta.sourceRow, 2);
  assert.equal("priority" in result.item.snippetMeta, false);
});

test("reports an empty English message as a row error", () => {
  const result = normalizeSnippetRow({ ...baseRow, 英文即时消息: "" }, 17);
  assert.equal(result.item, null);
  assert.equal(result.error, "第 17 行：英文即时消息不能为空");
});

test("builds an import preview that skips exact existing duplicates", () => {
  const normalized = normalizeSnippetRow(baseRow, 2).item;
  const preview = buildSnippetImportPreview(
    [baseRow, { ...baseRow, 标题: "物流－查询物流－发送单号", 沟通阶段: "物流", 具体场景: "查询物流", 核心动作: "发送单号", 英文即时消息: "Tracking number: [Tracking Number]", 中文对照: "物流单号：[Tracking Number]", 可替换变量: "Tracking Number" }],
    [{ ...normalized, id: "existing-id" }],
    () => "new-id",
    1234,
  );
  assert.equal(preview.totalCount, 2);
  assert.equal(preview.importableCount, 1);
  assert.equal(preview.duplicateCount, 1);
  assert.equal(preview.errorCount, 0);
  assert.deepEqual(preview.folders, ["物流清关"]);
  assert.equal(preview.items[0].id, "new-id");
  assert.equal(preview.items[0].createdAt, 1234);
});

test("builds folder preview in fixed customer-flow order", () => {
  const rows = [
    { ...baseRow, 沟通阶段: "售后", 具体场景: "退款" },
    { ...baseRow, 沟通阶段: "报价", 具体场景: "首次报价" },
    { ...baseRow, 沟通阶段: "售后", 具体场景: "补发" },
  ];

  assert.deepEqual(buildSnippetImportPreview(rows, [], () => "id", 1).folders, ["报价成交", "售后争议"]);
});

test("reports an unknown spreadsheet directory instead of creating it", () => {
  const result = normalizeSnippetRow({ ...baseRow, 沟通阶段: "客服" }, 9);
  assert.equal(result.item, null);
  assert.equal(result.error, "第 9 行：沟通阶段“客服”不是标准目录");
});

test("includes structured Chinese and product metadata in search text", () => {
  const item = { ...normalizeSnippetRow(baseRow, 2).item, snippetNumber: "CB-0042" };
  const search = snippetSearchText(item);
  assert.match(search, /您好/);
  assert.match(search, /包装\/Logo/);
  assert.match(search, /首次报价/);
  assert.match(search, /CB-0042/);
  assert.doesNotMatch(search, /派生字段不应持久化/);
});

test("fills literal bracket variables and reports every missing value", () => {
  assert.deepEqual(
    fillSnippetTemplate("Hi [Customer Name], tracking: [Tracking Number]", { "Customer Name": "Mia" }),
    { text: "Hi Mia, tracking: [Tracking Number]", missing: ["Tracking Number"] },
  );
  assert.deepEqual(
    fillSnippetTemplate("Hi [Customer Name]", { "Customer Name": "  Mia  " }),
    { text: "Hi Mia", missing: [] },
  );
});

test("parses the named 话术库 worksheet and preserves every source column", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["说明"], ["不是数据"]]), "分类统计");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ 序号: 1, ...baseRow }]), "话术库");
  const binary = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const rows = parseSnippetWorkbook(binary, "话术.xlsx");
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]), [
    "序号", "标题", "沟通阶段", "具体场景", "核心动作", "产品/业务", "搜索关键词",
    "英文即时消息", "中文对照", "可替换变量", "使用备注", "优先级",
  ]);
  assert.equal(rows[0].英文即时消息, baseRow.英文即时消息);
});

test("falls back to the first worksheet with all required columns", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["说明"]]), "Sheet1");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([baseRow]), "客服资料");
  const rows = parseSnippetWorkbook(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), "客服.xlsx");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].沟通阶段, "报价");
});

test("parses CSV locally and drops fully empty rows", () => {
  const csv = [
    "标题,沟通阶段,具体场景,核心动作,英文即时消息,中文对照",
    '"报价－首次报价－发送睫毛报价",报价,首次报价,发送睫毛报价,"Hello, customer",您好',
    ",,,,,",
  ].join("\n");
  const rows = parseSnippetWorkbook(new TextEncoder().encode(csv).buffer, "话术.csv");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].英文即时消息, "Hello, customer");
});

test("rejects workbooks without the required snippet columns", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ 标题: "缺少字段" }]), "话术库");
  assert.throws(
    () => parseSnippetWorkbook(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), "错误.xlsx"),
    /缺少必需列：沟通阶段、具体场景、核心动作、英文即时消息、中文对照/,
  );
});

test("rejects unsupported spreadsheet extensions", () => {
  assert.throws(() => parseSnippetWorkbook(new ArrayBuffer(0), "话术.json"), /仅支持 XLSX 和 CSV/);
});

test("matches structured product groups without hiding legacy snippets in the default filter", () => {
  const structured = normalizeSnippetRow(baseRow, 2).item;
  const legacy = { id: "legacy", label: "旧话术", secret: "hello", note: "", color: "#fff", kind: "snippet", createdAt: 1, updatedAt: 1 };
  assert.equal(matchesSnippetProduct(structured, "包装/Logo"), true);
  assert.equal(matchesSnippetProduct(structured, "物流/清关"), false);
  assert.equal(matchesSnippetProduct(structured, "全部产品"), true);
  assert.equal(matchesSnippetProduct(legacy, "全部产品"), true);
  assert.equal(matchesSnippetProduct(legacy, "睫毛"), false);
});

test("requires placeholder values, checklist confirmations, and verification confirmation before copy", () => {
  const item = normalizeSnippetRow(baseRow, 2).item;
  assert.deepEqual(snippetCopyReadiness(item, {}, [], false), {
    ready: false,
    missingPlaceholders: ["Customer Name"],
    missingChecks: ["Price"],
    needsVerification: true,
  });
  assert.deepEqual(snippetCopyReadiness(item, { "Customer Name": "Mia" }, ["Price"], true), {
    ready: true,
    missingPlaceholders: [],
    missingChecks: [],
    needsVerification: false,
  });
});

test("resolves the raw English or Chinese snippet for immediate copy", () => {
  const item = normalizeSnippetRow(baseRow, 2).item;
  assert.equal(resolveSnippetCopySource(item, "en"), baseRow.英文即时消息);
  assert.equal(resolveSnippetCopySource(item, "zh"), baseRow.中文对照);
});

test("offers optional preparation without blocking standard copy", () => {
  const structured = normalizeSnippetRow(baseRow, 2).item;
  const plain = { ...structured, snippetMeta: { ...structured.snippetMeta, placeholders: [], requiredInputs: [], requiresVerification: false } };
  assert.equal(hasOptionalSnippetPreparation(structured), true);
  assert.equal(hasOptionalSnippetPreparation(plain), false);
  assert.equal(hasOptionalSnippetPreparation({ ...structured, snippetMeta: undefined }), false);
});
