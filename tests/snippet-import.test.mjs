import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import writeExcelFile from "write-excel-file/node";
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

// Builds a real .xlsx file in memory: sheets = [{ name, rows: [[cell, ...], ...] }], first row = column names.
async function makeXlsx(sheets) {
  const buffer = await writeExcelFile(sheets.map(({ name, rows }) => ({ sheet: name, data: rows.map((row) => row.map((value) => ({ value }))) }))).toBuffer();
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function rowsOf(object) {
  return [Object.keys(object), Object.values(object)];
}

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

test("parses the named 话术库 worksheet and preserves every source column", async () => {
  const binary = await makeXlsx([
    { name: "分类统计", rows: [["说明"], ["不是数据"]] },
    { name: "话术库", rows: rowsOf({ 序号: 1, ...baseRow }) },
  ]);
  const rows = await parseSnippetWorkbook(binary, "话术.xlsx");
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]), [
    "序号", "标题", "沟通阶段", "具体场景", "核心动作", "产品/业务", "搜索关键词",
    "英文即时消息", "中文对照", "可替换变量", "使用备注", "优先级",
  ]);
  assert.equal(rows[0].英文即时消息, baseRow.英文即时消息);
  assert.equal(rows[0].序号, "1");
});

test("falls back to the first worksheet with all required columns", async () => {
  const binary = await makeXlsx([
    { name: "Sheet1", rows: [["说明"]] },
    { name: "客服资料", rows: rowsOf(baseRow) },
  ]);
  const rows = await parseSnippetWorkbook(binary, "客服.xlsx");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].沟通阶段, "报价");
});

test("reads numbers, empty cells and blank rows from a worksheet as text", async () => {
  const header = ["序号", "标题", "沟通阶段", "具体场景", "核心动作", "英文即时消息", "中文对照"];
  const binary = await makeXlsx([{ name: "话术库", rows: [
    header,
    [2.5, "a", "b", "c", "d", "line1\nline2", ""],
    [null, null, null, null, null, null, null],
    [3, "x", 7, "c", "d", "e", "f"],
  ] }]);
  const rows = await parseSnippetWorkbook(binary, "数字.xlsx");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].序号, "2.5");
  assert.equal(rows[0].英文即时消息, "line1\nline2");
  assert.equal(rows[0].中文对照, "");
  assert.equal(rows[1].沟通阶段, "7");
});

test("a repeated column name keeps both columns", async () => {
  const binary = await makeXlsx([{ name: "话术库", rows: [
    ["标题", "沟通阶段", "具体场景", "核心动作", "英文即时消息", "中文对照", "标题"],
    ["第一", "报价", "c", "d", "e", "f", "第二"],
  ] }]);
  const [row] = await parseSnippetWorkbook(binary, "重复.xlsx");
  assert.equal(row.标题, "第一");
  assert.equal(row.标题_1, "第二");
});

test("parses CSV locally and drops fully empty rows", async () => {
  const csv = [
    "标题,沟通阶段,具体场景,核心动作,英文即时消息,中文对照",
    '"报价－首次报价－发送睫毛报价",报价,首次报价,发送睫毛报价,"Hello, customer",您好',
    ",,,,,",
  ].join("\n");
  const rows = await parseSnippetWorkbook(new TextEncoder().encode(csv).buffer, "话术.csv");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].英文即时消息, "Hello, customer");
});

test("CSV: a BOM, Windows line endings and line breaks inside quotes are handled", async () => {
  const csv = "\uFEFF标题,沟通阶段,具体场景,核心动作,英文即时消息,中文对照\r\nA,报价,c,d,\"line1\r\nline2\",您好\r\n";
  const rows = await parseSnippetWorkbook(new TextEncoder().encode(csv).buffer, "话术.csv");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].标题, "A");
  assert.equal(rows[0].英文即时消息, "line1\nline2");
});

test("the sample sheet in docs/samples imports as before (37 rows)", async () => {
  const bytes = readFileSync(new URL("../docs/samples/clipbox-test-snippets.csv", import.meta.url));
  const rows = await parseSnippetWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "clipbox-test-snippets.csv");
  assert.equal(rows.length, 37);
  assert.equal(rows[31].标题, "需要整理的文本｜凌乱格式测试");
  assert.equal(rows[31].中文对照, "您好  ，感谢您的留言 ！我们会 尽快 回复 。\n\n\n   此致 ，\n  [Sender]");
});

test("rejects workbooks without the required snippet columns", async () => {
  const binary = await makeXlsx([{ name: "话术库", rows: [["标题"], ["缺少字段"]] }]);
  await assert.rejects(
    parseSnippetWorkbook(binary, "错误.xlsx"),
    /缺少必需列：沟通阶段、具体场景、核心动作、英文即时消息、中文对照/,
  );
});

test("rejects unsupported extensions, damaged files and oversized files", async () => {
  await assert.rejects(parseSnippetWorkbook(new ArrayBuffer(0), "话术.json"), /仅支持 XLSX 和 CSV/);
  await assert.rejects(parseSnippetWorkbook(new TextEncoder().encode("not a zip").buffer, "坏.xlsx"), /无法读取这个表格文件/);
  await assert.rejects(parseSnippetWorkbook(new ArrayBuffer(21 * 1024 * 1024), "大.xlsx"), /表格文件太大/);
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

test("requires placeholder values before copy; the old 发送前确认 / 发送前核实 ticks no longer matter", () => {
  const item = normalizeSnippetRow(baseRow, 2).item;
  assert.deepEqual(snippetCopyReadiness(item, {}), {
    ready: false,
    missingPlaceholders: ["Customer Name"],
  });
  assert.deepEqual(snippetCopyReadiness(item, { "Customer Name": "Mia" }), {
    ready: true,
    missingPlaceholders: [],
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

test("readiness for the Chinese text only needs the variables that text uses", () => {
  const item = { id: "x", label: "x", secret: "Hi [Name], best [Sender]", note: "", color: "#fff", kind: "snippet", createdAt: 1, updatedAt: 1,
    snippetMeta: { stage: "询盘接待", scene: "s", action: "a", productGroups: [], rawProduct: "", chineseText: "此致 [Sender]", placeholders: ["Name", "Sender"], requiredInputs: [], usageNote: "", requiresVerification: false } };
  assert.deepEqual(snippetCopyReadiness(item, { Sender: "Amy" }, "zh").missingPlaceholders, []);
  assert.equal(snippetCopyReadiness(item, { Sender: "Amy" }, "zh").ready, true);
  assert.deepEqual(snippetCopyReadiness(item, { Sender: "Amy" }, "en").missingPlaceholders, ["Name"]);
  assert.deepEqual(snippetCopyReadiness(item, { Sender: "Amy" }).missingPlaceholders, ["Name"]);
});
