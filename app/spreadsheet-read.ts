// Reads a spreadsheet file someone sent us into plain text tables, one per sheet. The only place that knows which
// parsing libraries are used (read-excel-file for .xlsx, papaparse for .csv); everything else works on strings.
import readXlsxFile from "read-excel-file/universal";
import Papa from "papaparse";

export type SheetTable = { name: string; rows: string[][] };

// A snippet sheet is a few hundred KB at most; a bigger file is not one, and parsing it could freeze the window.
export const MAX_SPREADSHEET_BYTES = 20 * 1024 * 1024;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

function toTable(name: string, data: unknown[][]): SheetTable {
  return { name, rows: data.map((row) => row.map(cellText)) };
}

export async function readSpreadsheet(buffer: ArrayBuffer, fileName: string): Promise<SheetTable[]> {
  const extension = fileName.toLocaleLowerCase().split(".").pop();
  if (extension !== "xlsx" && extension !== "csv") throw new Error("仅支持 XLSX 和 CSV 文件");
  if (buffer.byteLength > MAX_SPREADSHEET_BYTES) throw new Error("表格文件太大，请拆成几个小文件再导入");

  if (extension === "csv") {
    const result = Papa.parse<string[]>(new TextDecoder("utf-8").decode(buffer), { skipEmptyLines: "greedy" });
    // Line breaks inside quoted cells are kept as \n, the way the previous reader returned them.
    return [toTable("Sheet1", result.data.map((row) => row.map((cell) => cell.replace(/\r\n?/g, "\n"))))];
  }

  try {
    const sheets = await readXlsxFile(buffer);
    return sheets.map((sheet) => toTable(sheet.sheet, sheet.data));
  } catch {
    throw new Error("无法读取这个表格文件，请确认它是有效的 XLSX 文件");
  }
}
