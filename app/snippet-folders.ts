export const STANDARD_SNIPPET_FOLDERS = [
  "询盘接待",
  "产品样品",
  "报价成交",
  "定制生产",
  "客户跟进",
  "物流清关",
  "售后争议",
] as const;

export type StandardSnippetFolder = typeof STANDARD_SNIPPET_FOLDERS[number];

const STANDARD_FOLDER_SET = new Set<string>(STANDARD_SNIPPET_FOLDERS);

const LEGACY_SNIPPET_FOLDERS: Record<string, StandardSnippetFolder> = {
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

export function isStandardSnippetFolder(value: string): value is StandardSnippetFolder {
  return STANDARD_FOLDER_SET.has(value.trim());
}

export function requireStandardSnippetFolder(value: string): StandardSnippetFolder {
  const folder = value.trim();
  if (!isStandardSnippetFolder(folder)) {
    throw new Error(`话术目录只能使用标准目录：${STANDARD_SNIPPET_FOLDERS.join("、")}`);
  }
  return folder;
}

export function normalizeImportedSnippetFolder(value: string): StandardSnippetFolder | "" {
  const folder = value.trim();
  if (isStandardSnippetFolder(folder)) return folder;
  return LEGACY_SNIPPET_FOLDERS[folder] || "";
}

export function orderStandardSnippetFolders(values: Iterable<string>) {
  const available = new Set(values);
  return STANDARD_SNIPPET_FOLDERS.filter((folder) => available.has(folder));
}
