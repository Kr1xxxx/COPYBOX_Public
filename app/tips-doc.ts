import { COMPANY_TIPS } from "./company-tips.ts";
import type { Tip, TipExample } from "./daily-tips.ts";
import { readSpreadsheet } from "./spreadsheet-read.ts";

// A Tips document in the shape of docs/company-tips.md (template: docs/tips-doc-template.md, D-068):
//   **标题**           starts a tip; the plain lines under it are its text
//   ✅ … / ❌ …        a right / wrong example, shown as a highlight block
//   来源: …            shown at the end of the tip
// Headings (#), quotes (>), list lines (- ) and --- are skipped. Ids follow document order (C-001, …), which is how
// tools/company-tips.mjs builds the tips the app ships with.
export function parseTipsDocument(markdown: string): Tip[] {
  const tips: Tip[] = [];
  let tip: { title: string; lines: string[]; examples: TipExample[]; source?: string } | null = null;
  const finish = () => {
    if (!tip) return;
    tips.push({
      id: `C-${String(tips.length + 1).padStart(3, "0")}`,
      title: tip.title,
      text: tip.lines.join("\n"),
      ...(tip.examples.length ? { examples: tip.examples } : {}),
      ...(tip.source ? { source: tip.source } : {}),
    });
    tip = null;
  };
  for (const raw of markdown.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    const title = line.match(/^\*\*(.+)\*\*$/);
    if (title) { finish(); tip = { title: title[1].trim(), lines: [], examples: [] }; continue; }
    if (line.startsWith("#") || line === "---") { finish(); continue; }
    if (!tip || !line || line.startsWith(">") || line.startsWith("- ")) continue;
    if (line.startsWith("✅")) tip.examples.push({ good: true, text: line.slice(1).trim() });
    else if (line.startsWith("❌")) tip.examples.push({ good: false, text: line.slice(1).trim() });
    else if (/^来源[:：]/.test(line)) tip.source = line.replace(/^来源[:：]\s*/, "");
    else tip.lines.push(line);
  }
  finish();
  return tips;
}

export const TIPS_SHEET_COLUMNS = ["标题", "内容"] as const;

// A Tips table: one row per tip with the columns 标题 and 内容, and optionally 正确写法, 错误写法 (one example per line) and 来源.
export function tipsFromRows(rows: string[][]): Tip[] {
  const [header = [], ...data] = rows;
  const column = (name: string) => header.findIndex((cell) => cell.trim() === name);
  const missing = TIPS_SHEET_COLUMNS.filter((name) => column(name) < 0);
  if (missing.length) throw new Error(`Tips 表格缺少列：${missing.join("、")}`);
  const at = { title: column("标题"), text: column("内容"), good: column("正确写法"), bad: column("错误写法"), source: column("来源") };
  const cell = (row: string[], index: number) => (index < 0 ? "" : (row[index] ?? "").trim());
  const lines = (value: string) => value.split(/\r?\n/).map((line) => line.replace(/^[✅❌]\s*/, "").trim()).filter(Boolean);
  const tips: Tip[] = [];
  for (const row of data) {
    const title = cell(row, at.title);
    if (!title) continue;
    const examples = [...lines(cell(row, at.good)).map((text) => ({ good: true, text })), ...lines(cell(row, at.bad)).map((text) => ({ good: false, text }))];
    const source = cell(row, at.source);
    tips.push({ id: "", title, text: cell(row, at.text), ...(examples.length ? { examples } : {}), ...(source ? { source } : {}) });
  }
  return tips;
}

// Small stable hash, only to turn a title into an id.
function titleHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

// Imported tips are known by their title: the same title as a tip the app ships with replaces that tip, and importing
// the same file again updates its tips instead of adding them twice.
export function withImportIds(tips: Tip[]): Tip[] {
  const shipped = new Map(COMPANY_TIPS.map((tip) => [tip.title, tip.id]));
  return tips.map((tip) => ({ ...tip, id: shipped.get(tip.title) ?? `M-${titleHash(tip.title)}` }));
}

export const TIPS_FILE_EXTENSIONS = /\.(md|xlsx|csv)$/i;
export const TIPS_EMPTY = "没有找到 Tips：每条 Tips 的标题要单独一行，写成 **标题**";

// Reads a Tips file the person picked: a .md document or an .xlsx / .csv table.
export async function readTipsFile(file: File): Promise<Tip[]> {
  if (!TIPS_FILE_EXTENSIONS.test(file.name)) throw new Error("只支持 .md Tips 文档和 .xlsx / .csv 表格");
  const tips = /\.md$/i.test(file.name)
    ? parseTipsDocument(await file.text())
    : tipsFromRows((await readSpreadsheet(await file.arrayBuffer(), file.name))[0]?.rows ?? []);
  if (!tips.length) throw new Error(TIPS_EMPTY);
  return withImportIds(tips);
}
