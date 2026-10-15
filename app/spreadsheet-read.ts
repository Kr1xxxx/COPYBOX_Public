// Reads a spreadsheet file someone sent us into plain text tables, one per sheet. The only place that knows which
// parsing libraries are used (read-excel-file for .xlsx, papaparse for .csv); everything else works on strings.
import readXlsxFile from "read-excel-file/universal";
import Papa from "papaparse";
import { strFromU8, unzipSync } from "fflate";
import { formatCodeFor, formatNumberCell } from "./spreadsheet-format.ts";

export type SheetTable = { name: string; rows: string[][] };

// A snippet sheet is a few hundred KB at most; a bigger file is not one, and parsing it could freeze the window.
export const MAX_SPREADSHEET_BYTES = 20 * 1024 * 1024;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

// Excel writes characters that XML cannot hold as _x000D_ (a carriage return from pasted Windows text) and a literal
// "_x....._" as _x005F_x....._; turn them back into the characters they stand for.
export function decodeXmlEscapes(text: string) {
  return text.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function toTable(name: string, data: unknown[][], shown?: Map<string, string>): SheetTable {
  return {
    name,
    rows: data.map((row, r) => row.map((value, c) => {
      const display = shown?.get(`${r},${c}`);
      if (display !== undefined && (typeof value === "number" || value instanceof Date)) return display;
      return typeof value === "string" ? decodeXmlEscapes(cellText(value)) : cellText(value);
    })),
  };
}

function xmlText(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function attribute(tag: string, name: string) {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? xmlText(match[1]) : undefined;
}

function columnIndex(letters: string) {
  return letters.split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

// read-excel-file returns numbers as plain numbers, so the "001" or "50%" a person sees is lost. Read the number
// format of every numeric cell straight from the file and give back the text Excel shows, per sheet name,
// keyed "row,column" (0-based, the same positions as the table read-excel-file returns).
function numberCellDisplays(bytes: Uint8Array): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();
  const files = unzipSync(bytes, { filter: (file) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|styles\.xml|worksheets\/[^/]+\.xml)$/.test(file.name) });
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : "");
  const workbook = read("xl/workbook.xml");
  const date1904 = /<workbookPr[^>]*date1904="(1|true)"/.test(workbook);

  const custom = new Map<number, string>();
  const styles = read("xl/styles.xml");
  for (const tag of styles.match(/<numFmt\s[^>]*>/g) ?? []) {
    const id = attribute(tag, "numFmtId");
    const code = attribute(tag, "formatCode");
    if (id !== undefined && code !== undefined) custom.set(Number(id), code);
  }
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
  const styleCodes = (cellXfs.match(/<xf\b[^>]*>/g) ?? []).map((tag) => formatCodeFor(Number(attribute(tag, "numFmtId") ?? 0), custom));

  const targets = new Map<string, string>();
  for (const tag of read("xl/_rels/workbook.xml.rels").match(/<Relationship\s[^>]*>/g) ?? []) {
    const id = attribute(tag, "Id");
    const target = attribute(tag, "Target");
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }

  for (const tag of workbook.match(/<sheet\s[^>]*>/g) ?? []) {
    const name = attribute(tag, "name");
    const target = targets.get(/\sr:id="([^"]*)"/.exec(tag)?.[1] ?? "");
    if (!name || !target) continue;
    const cells = new Map<string, string>();
    for (const [, cellTag, inner] of read(target).matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const type = attribute(` ${cellTag}`, "t");
      if (type !== undefined && type !== "n") continue;
      const ref = /^([A-Z]+)(\d+)$/.exec(attribute(` ${cellTag}`, "r") ?? "");
      const raw = /<v>([^<]*)<\/v>/.exec(inner ?? "")?.[1];
      if (!ref || raw === undefined || raw === "" || !Number.isFinite(Number(raw))) continue;
      const code = styleCodes[Number(attribute(` ${cellTag}`, "s") ?? 0)] ?? "General";
      cells.set(`${Number(ref[2]) - 1},${columnIndex(ref[1])}`, formatNumberCell(Number(raw), code, date1904));
    }
    result.set(name, cells);
  }
  return result;
}

export async function readSpreadsheet(buffer: ArrayBuffer, fileName: string): Promise<SheetTable[]> {
  const extension = fileName.toLocaleLowerCase().split(".").pop();
  if (extension !== "xlsx" && extension !== "csv") throw new Error("只支持 .md 话术文档和 .xlsx / .csv 表格");
  if (buffer.byteLength > MAX_SPREADSHEET_BYTES) throw new Error("表格文件太大，请拆成几个小文件再导入");

  if (extension === "csv") {
    const result = Papa.parse<string[]>(new TextDecoder("utf-8").decode(buffer), { skipEmptyLines: "greedy" });
    // Line breaks inside quoted cells are kept as \n, the way the previous reader returned them.
    return [toTable("Sheet1", result.data.map((row) => row.map((cell) => cell.replace(/\r\n?/g, "\n"))))];
  }

  try {
    const sheets = await readXlsxFile(buffer);
    let displays = new Map<string, Map<string, string>>();
    try { displays = numberCellDisplays(new Uint8Array(buffer)); } catch { /* keep plain numbers */ }
    return sheets.map((sheet) => toTable(sheet.sheet, sheet.data, displays.get(sheet.sheet)));
  } catch {
    throw new Error("无法读取这个表格文件，请确认它是有效的 XLSX 文件");
  }
}
