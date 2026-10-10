import * as XLSX from "xlsx";
import type { SecretItem, SnippetMeta } from "./clipbox-core";
import { normalizeImportedSnippetFolder, orderStandardSnippetFolders } from "./snippet-folders.ts";

export const PRODUCT_GROUPS = ["睫毛", "镊子", "假发/发束", "洗发水", "包装/Logo", "物流/清关", "平台", "通用"] as const;
export const REQUIRED_SNIPPET_COLUMNS = ["标题", "沟通阶段", "具体场景", "核心动作", "英文即时消息", "中文对照"] as const;

export type SnippetImportItem = Omit<SecretItem, "id" | "createdAt" | "updatedAt">;

export type SnippetImportRow = {
  sourceRow: number;
  item: SnippetImportItem | null;
  error: string;
};

export type SnippetImportPreview = {
  totalCount: number;
  importableCount: number;
  duplicateCount: number;
  errorCount: number;
  errors: string[];
  folders: string[];
  items: SecretItem[];
};

function sheetRows(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false })
    .filter((row) => Object.values(row).some((value) => text(value) !== ""));
}

function missingColumns(rows: Record<string, unknown>[], sheet: XLSX.WorkSheet) {
  const headerRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const headers = new Set((headerRows[0] || []).map(text));
  if (rows.length > 0) Object.keys(rows[0]).forEach((key) => headers.add(key));
  return REQUIRED_SNIPPET_COLUMNS.filter((column) => !headers.has(column));
}

export function parseSnippetWorkbook(buffer: ArrayBuffer, fileName: string) {
  const extension = fileName.toLocaleLowerCase().split(".").pop();
  if (extension !== "xlsx" && extension !== "csv") throw new Error("仅支持 XLSX 和 CSV 文件");
  const workbook = extension === "csv"
    ? XLSX.read(new TextDecoder("utf-8").decode(buffer), { type: "string", cellDates: false })
    : XLSX.read(buffer, { type: "array", cellDates: false });
  if (workbook.SheetNames.length === 0) throw new Error("表格中没有可读取的工作表");

  let sheetName = workbook.SheetNames.includes("话术库") ? "话术库" : "";
  if (!sheetName) {
    sheetName = workbook.SheetNames.find((name) => {
      const sheet = workbook.Sheets[name];
      return missingColumns(sheetRows(sheet), sheet).length === 0;
    }) || "";
  }
  if (!sheetName) throw new Error(`缺少必需列：${REQUIRED_SNIPPET_COLUMNS.join("、")}`);

  const sheet = workbook.Sheets[sheetName];
  const rows = sheetRows(sheet);
  const missing = missingColumns(rows, sheet);
  if (missing.length > 0) throw new Error(`缺少必需列：${missing.join("、")}`);
  return rows;
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractPlaceholders(value: string) {
  return unique(Array.from(value.matchAll(/\[([^\]]+)\]/g), (match) => match[1].trim()));
}

function splitDeclaredInputs(value: string) {
  if (!value) return [];
  return unique(value.split(/[,，、;；|\n]+/)
    .map((part) => part.trim().replace(/^\[|\]$/g, "").trim())
    .filter(Boolean));
}

export function productGroupsForRawProduct(rawProduct: string) {
  const groups: string[] = [];
  const rules: Array<[string, RegExp]> = [
    ["睫毛", /睫毛|lash/i],
    ["镊子", /镊子|tweezer/i],
    ["假发/发束", /假发|发束|closure|frontal|raw hair|真人发|wig|bundle/i],
    ["洗发水", /洗发水|shampoo/i],
    ["包装/Logo", /包装|logo|盒|box|package/i],
    ["物流/清关", /物流|清关|运费|发货|快递|dhl|fedex|ups|shipping|delivery|tracking/i],
    ["平台", /alibaba|aliexpress|平台/i],
  ];
  for (const [group, pattern] of rules) if (pattern.test(rawProduct)) groups.push(group);
  if (/通用|全部|不限/.test(rawProduct) || groups.length === 0) groups.push("通用");
  return unique(groups);
}

function needsVerification(usageNote: string, requiredInputs: string[]) {
  return /核实|确认.*(?:金额|价格|库存|时效|日期|地址|运费)|金额|库存|时效/.test(usageNote)
    || requiredInputs.some((value) => /price|cost|amount|stock|inventory|date|address|shipping|金额|价格|库存|日期|地址|运费/i.test(value));
}

export function normalizeSnippetRow(row: Record<string, unknown>, sourceRow: number): SnippetImportRow {
  const title = text(row.标题);
  const stage = text(row.沟通阶段);
  const scene = text(row.具体场景);
  const action = text(row.核心动作);
  const rawProduct = text(row["产品/业务"]);
  const englishText = text(row.英文即时消息);
  const chineseText = text(row.中文对照);
  const usageNote = text(row.使用备注);
  if (!englishText) return { sourceRow, item: null, error: `第 ${sourceRow} 行：英文即时消息不能为空` };
  if (!stage || !scene || !action) return { sourceRow, item: null, error: `第 ${sourceRow} 行：沟通阶段、具体场景和核心动作不能为空` };
  const standardFolder = normalizeImportedSnippetFolder(stage);
  if (!standardFolder) return { sourceRow, item: null, error: `第 ${sourceRow} 行：沟通阶段“${stage}”不是标准目录` };

  const placeholders = extractPlaceholders(`${englishText}\n${chineseText}`);
  const placeholderKeys = new Set(placeholders.map((value) => value.toLocaleLowerCase()));
  const requiredInputs = splitDeclaredInputs(text(row.可替换变量))
    .filter((value) => !placeholderKeys.has(value.toLocaleLowerCase()));
  const snippetMeta: SnippetMeta = {
    stage: standardFolder,
    scene,
    action,
    productGroups: productGroupsForRawProduct(rawProduct),
    rawProduct,
    chineseText,
    placeholders,
    requiredInputs,
    usageNote,
    requiresVerification: needsVerification(usageNote, requiredInputs),
    sourceRow,
  };
  return {
    sourceRow,
    error: "",
    item: {
      label: scene || title,
      secret: englishText,
      note: "",
      color: "#ffcfa8",
      kind: "snippet",
      summary: action,
      folder: standardFolder,
      pinned: false,
      snippetMeta,
    },
  };
}

function signature(item: Pick<SecretItem, "kind" | "label" | "secret">) {
  return `${item.kind || "secret"}\u0000${item.label}\u0000${item.secret}`;
}

export function buildSnippetImportPreview(
  rows: Record<string, unknown>[],
  current: SecretItem[],
  createId: () => string,
  now: number,
): SnippetImportPreview {
  const normalized = rows.map((row, index) => normalizeSnippetRow(row, index + 2));
  const sceneCounts = new Map<string, number>();
  for (const result of normalized) {
    const scene = result.item?.snippetMeta?.scene;
    if (scene) sceneCounts.set(scene, (sceneCounts.get(scene) || 0) + 1);
  }

  const signatures = new Set(current.map(signature));
  const items: SecretItem[] = [];
  let duplicateCount = 0;
  for (const result of normalized) {
    if (!result.item) continue;
    const meta = result.item.snippetMeta as SnippetMeta;
    const item = sceneCounts.get(meta.scene)! > 1
      ? { ...result.item, label: `${meta.scene} · ${meta.action}` }
      : result.item;
    const key = signature(item);
    if (signatures.has(key)) {
      duplicateCount += 1;
      continue;
    }
    signatures.add(key);
    items.push({ ...item, id: createId(), createdAt: now, updatedAt: now });
  }
  const errors = normalized.map((result) => result.error).filter(Boolean);
  return {
    totalCount: rows.length,
    importableCount: items.length,
    duplicateCount,
    errorCount: errors.length,
    errors,
    folders: orderStandardSnippetFolders(items.map((item) => item.folder || "")),
    items,
  };
}

export function snippetSearchText(item: SecretItem) {
  const meta = item.snippetMeta;
  return [
    item.snippetNumber || "",
    item.label,
    item.summary,
    item.secret,
    item.note,
    item.folder,
    meta?.stage,
    meta?.scene,
    meta?.action,
    meta?.rawProduct,
    meta?.productGroups.join(" "),
    meta?.chineseText,
    meta?.usageNote,
  ].filter(Boolean).join(" ");
}

export function fillSnippetTemplate(template: string, values: Record<string, string>) {
  const missing: string[] = [];
  let filled = template;
  for (const placeholder of extractPlaceholders(template)) {
    const value = values[placeholder]?.trim() || "";
    if (!value) {
      missing.push(placeholder);
      continue;
    }
    filled = filled.split(`[${placeholder}]`).join(value);
  }
  return { text: filled, missing };
}

export function resolveSnippetCopySource(item: SecretItem | SnippetImportItem, language: "en" | "zh") {
  return language === "zh" ? item.snippetMeta?.chineseText || "" : item.secret;
}

export function hasOptionalSnippetPreparation(item: SecretItem | SnippetImportItem) {
  const meta = item.snippetMeta;
  return Boolean(meta && (meta.placeholders.length > 0 || meta.requiredInputs.length > 0 || meta.requiresVerification));
}

export function matchesSnippetProduct(item: SecretItem | SnippetImportItem, product: string) {
  if (product === "全部产品") return true;
  return item.snippetMeta?.productGroups.includes(product) ?? false;
}

export function snippetCopyReadiness(
  item: SecretItem | SnippetImportItem,
  values: Record<string, string>,
  checkedInputs: string[],
  verificationConfirmed: boolean,
  language?: "en" | "zh",
) {
  const meta = item.snippetMeta;
  if (!meta) return { ready: true, missingPlaceholders: [], missingChecks: [], needsVerification: false };
  // The English and Chinese texts can use different variable names; only the ones in the text being copied need a value.
  const needed = language ? extractPlaceholders(resolveSnippetCopySource(item, language)) : meta.placeholders;
  const missingPlaceholders = needed.filter((name) => !values[name]?.trim());
  const checked = new Set(checkedInputs);
  const missingChecks = meta.requiredInputs.filter((name) => !checked.has(name));
  const needsVerification = meta.requiresVerification && !verificationConfirmed;
  return {
    ready: missingPlaceholders.length === 0 && missingChecks.length === 0 && !needsVerification,
    missingPlaceholders,
    missingChecks,
    needsVerification,
  };
}
