import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import writeExcelFile from "write-excel-file/node";
import { formatCodeFor, formatNumberCell } from "../app/spreadsheet-format.ts";
import { decodeXmlEscapes, readSpreadsheet } from "../app/spreadsheet-read.ts";

async function xlsx(rows, name = "S") {
  const buffer = await writeExcelFile([{ sheet: name, data: rows }]).toBuffer();
  return new Uint8Array(buffer);
}

const toBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const num = (value, format) => ({ value, type: Number, format });

test("numbers keep the look the cell has in Excel", async () => {
  const bytes = await xlsx([
    [{ value: "列" }],
    [num(1, "000")],
    [num(0.5, "0%")],
    [num(1234.5, "#,##0.00")],
    [num(0.1 + 0.2)],
    [num(7)],
    [{ value: new Date(Date.UTC(2023, 2, 15)), type: Date, format: "yyyy-mm-dd" }],
  ]);
  const [sheet] = await readSpreadsheet(toBuffer(bytes), "表.xlsx");
  assert.deepEqual(sheet.rows.map((row) => row[0]), ["列", "001", "50%", "1,234.50", "0.3", "7", "2023-03-15"]);
});

test("positions line up when the sheet starts with an empty row and column", async () => {
  const bytes = await xlsx([
    [null, null, null],
    [null, { value: "标题" }, { value: "x" }],
    [null, num(5, "00"), num(0.25, "0.0%")],
  ]);
  const [sheet] = await readSpreadsheet(toBuffer(bytes), "表.xlsx");
  const flat = JSON.stringify(sheet.rows);
  assert.match(flat, /"05"/);
  assert.match(flat, /"25.0%"/);
});

test("_x000D_ from Windows line breaks in Excel cells becomes a real line break", async () => {
  const bytes = await xlsx([[{ value: "说明" }], [{ value: "line1MARKERline2" }]]);
  const files = unzipSync(bytes);
  files["xl/sharedStrings.xml"] = strToU8(strFromU8(files["xl/sharedStrings.xml"]).replace("MARKER", "_x000D_\n"));
  const [sheet] = await readSpreadsheet(toBuffer(zipSync(files)), "表.xlsx");
  assert.equal(sheet.rows[1][0], "line1\r\nline2");
  assert.equal(decodeXmlEscapes("a_x005F_x000D_b"), "a_x000D_b");
});

test("format codes: padding, percent, thousands, currency text, negatives, dates, unknown formats", () => {
  assert.equal(formatNumberCell(1, "000"), "001");
  assert.equal(formatNumberCell(0.5, "0%"), "50%");
  assert.equal(formatNumberCell(0.256, "0.00%"), "25.60%");
  assert.equal(formatNumberCell(1234.5, "#,##0.00"), "1,234.50");
  assert.equal(formatNumberCell(1234567, "#,##0"), "1,234,567");
  assert.equal(formatNumberCell(12.5, '"USD "0.00'), "USD 12.50");
  assert.equal(formatNumberCell(12.5, "$#,##0.00"), "$12.50");
  assert.equal(formatNumberCell(-3.5, "0.0"), "-3.5");
  assert.equal(formatNumberCell(-3.5, "0.0;(0.0)"), "(3.5)");
  assert.equal(formatNumberCell(3.14159, "0.##"), "3.14");
  assert.equal(formatNumberCell(3, "0.##"), "3");
  assert.equal(formatNumberCell(0.1 + 0.2, "General"), "0.3");
  assert.equal(formatNumberCell(45000, "yyyy-mm-dd"), "2023-03-15");
  assert.equal(formatNumberCell(45000, "m/d/yy"), "3/15/23");
  assert.equal(formatNumberCell(45000.75, "yyyy-mm-dd hh:mm"), "2023-03-15 18:00");
  assert.equal(formatNumberCell(45000, "mmm d, yyyy"), "Mar 15, 2023");
  assert.equal(formatNumberCell(1234, "0.00E+00"), "1234");
  assert.equal(formatNumberCell(5, "@"), "5");
});

test("Chinese-locale built-in date formats show the way Excel shows them", () => {
  const code = (id) => formatCodeFor(id, new Map());
  assert.equal(formatNumberCell(45000, code(31)), "2023年3月15日");
  assert.equal(formatNumberCell(45000, code(57)), "2023年3月");
  assert.equal(formatNumberCell(45000, code(58)), "3月15日");
  assert.equal(formatNumberCell(45000.75, code(32)), "18时00分");
  assert.equal(formatNumberCell(45000.75, code(34)), "下午6时00分");
  assert.equal(formatNumberCell(45000.25, code(35)), "上午6时00分00秒");
});
