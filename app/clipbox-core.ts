import { normalizeSnippetNumbers } from "./clipbox-order.ts";
import { STANDARD_SNIPPET_FOLDERS } from "./snippet-folders.ts";

export type ItemKind = "secret" | "snippet";
export const DEFAULT_ITEM_KIND: ItemKind = "snippet";

export function toggleItemKind(kind: ItemKind): ItemKind {
  return kind === "snippet" ? "secret" : "snippet";
}

export type SnippetMeta = {
  stage: string;
  scene: string;
  action: string;
  productGroups: string[];
  rawProduct: string;
  chineseText: string;
  placeholders: string[];
  requiredInputs: string[];
  usageNote: string;
  requiresVerification: boolean;
  sourceRow?: number;
};

// A 话术 that came from the company library. `baseHash` is the company text last applied here; if the text now differs, the
// employee changed it. `pending` holds a newer company version that was not applied over such a change.
export type SharedContent = {
  label: string;
  secret: string;
  note: string;
  summary: string;
  scene: string;
  action: string;
  productGroups: string[];
  rawProduct: string;
  chineseText: string;
  placeholders: string[];
  requiredInputs: string[];
  usageNote: string;
  requiresVerification: boolean;
};
export type SharedLink = {
  id: string;
  baseHash: string;
  pending?: { content: SharedContent; hash: string };
  retired?: boolean;
};

export type SecretItem = {
  id: string;
  label: string;
  secret: string;
  secretSegments?: [string, string];
  note: string;
  color: string;
  kind?: ItemKind;
  summary?: string;
  folder?: string;
  pinned?: boolean;
  snippetMeta?: SnippetMeta;
  snippetNumber?: string;
  shared?: SharedLink;
  lastUsedAt?: number;
  useCount?: number;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type FolderRegistry = Record<ItemKind, string[]>;
export type FolderColors = Record<ItemKind, Record<string, string>>;
// `sharedSeen`: ids of company 话术 this vault has already received, so one deleted on purpose is not added again. It sits in the
// vault (same encrypted save as the 话术, same backups) so a failed save cannot lose one without the other.
export type VaultData = { items: SecretItem[]; folders: FolderRegistry; nextSnippetNumber: number; folderColors?: FolderColors; sharedSeen?: string[] };
export type ImportStrategy = "merge" | "replace";
export type BackupScope = ItemKind;
export type RefreshContext = {
  activeKind: ItemKind;
  activeFolder: string;
  productFilter: string;
  query: string;
};
export const EMPTY_FOLDER_REGISTRY: FolderRegistry = { secret: [], snippet: [] };

export function isTrashedItem(item: SecretItem) {
  return typeof item.deletedAt === "number" && Number.isFinite(item.deletedAt) && item.deletedAt > 0;
}

export function selectItemsByTrashState(
  items: SecretItem[],
  kind: ItemKind,
  state: "active" | "trash",
) {
  const trashed = state === "trash";
  return items.filter((item) => (item.kind || "secret") === kind && isTrashedItem(item) === trashed);
}

// "all" and "trash" list every entry of the selected state; folders filter by name.
export function itemMatchesActiveFolder(item: SecretItem, activeFolder: string) {
  if (activeFolder === "all" || activeFolder === "trash") return true;
  if (activeFolder === "pinned") return Boolean(item.pinned);
  if (activeFolder === "recent") return typeof item.lastUsedAt === "number" && item.lastUsedAt > 0;
  if (activeFolder === "uncategorized") return !item.folder?.trim();
  return item.folder === activeFolder.slice(7);
}

export function buildDirectoryShortcuts(items: SecretItem[], kind: ItemKind) {
  const activeItems = selectItemsByTrashState(items, kind, "active");
  return [
    { id: "all", label: kind === "snippet" ? "全部话术" : "全部", count: activeItems.length },
    { id: "pinned", label: "收藏", count: activeItems.filter((item) => item.pinned).length },
    { id: "recent", label: "最近", count: activeItems.filter((item) => itemMatchesActiveFolder(item, "recent")).length },
  ];
}

export function canAddItemInFolder(activeFolder: string) {
  return activeFolder !== "pinned" && activeFolder !== "recent" && activeFolder !== "trash";
}

export function moveItemToTrash(items: SecretItem[], id: string, deletedAt: number) {
  return items.map((item) => item.id === id && !isTrashedItem(item) ? { ...item, deletedAt } : item);
}

export function restoreTrashedItem(items: SecretItem[], id: string) {
  return items.map((item) => {
    if (item.id !== id || !isTrashedItem(item)) return item;
    const restored = { ...item };
    delete restored.deletedAt;
    return restored;
  });
}

export function permanentlyDeleteTrashedItem(items: SecretItem[], id: string) {
  return items.filter((item) => item.id !== id || !isTrashedItem(item));
}

export function parseRefreshContext(value: string | null): RefreshContext | null {
  if (!value) return null;
  try {
    const context = JSON.parse(value) as Partial<RefreshContext>;
    if (context.activeKind !== "secret" && context.activeKind !== "snippet") return null;
    if (typeof context.activeFolder !== "string" || typeof context.productFilter !== "string" || typeof context.query !== "string") return null;
    return {
      activeKind: context.activeKind,
      activeFolder: context.activeFolder,
      productFilter: context.productFilter,
      query: context.query,
    };
  } catch {
    return null;
  }
}

export function limitChars(value: string, length = 10) {
  return Array.from(value.trim()).slice(0, length).join("");
}

export function normalizeReferenceNote(value: string) {
  return limitChars(value, 120);
}

export function splitSecretSegments(value: string): [string, string] {
  const lineBreak = value.indexOf("\n");
  if (lineBreak < 0) return [value, ""];
  return [value.slice(0, lineBreak).replace(/\r$/, ""), value.slice(lineBreak + 1)];
}

export function combineSecretSegments(value: readonly [string, string]) {
  return `${value[0]}\n${value[1]}`;
}

export function normalizeSecretSegments(value: unknown): [string, string] | undefined {
  if (!Array.isArray(value) || value.length !== 2 || value.some((part) => typeof part !== "string")) return undefined;
  return [value[0], value[1]];
}

// All 话术 live in one localStorage entry, and every origin gets about 5 million characters there (shared with the
// 账号 keys). When it is full, retrying never helps, so the person is told what to do instead.
export const STORAGE_FULL_MESSAGE = "存储空间满了，请清空回收站或删掉不用的内容";
export const STORAGE_NEARLY_FULL_MESSAGE = "存储空间快满了，请清空回收站或删掉不用的内容";
export const STORAGE_QUOTA_CHARS = 5_000_000;
export const STORAGE_WARN_RATIO = 0.85;

// The browser's "storage is full" error, under the names and codes the engines have used for it.
export function isQuotaError(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth += 1) {
    const { name, code, cause } = current as { name?: unknown; code?: unknown; cause?: unknown };
    if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014) return true;
    current = cause;
  }
  return false;
}

// Characters Clipbox keeps in localStorage (keys and values of every clipbox.* entry).
export function clipboxStorageChars(storage: Pick<Storage, "length" | "key" | "getItem">): number {
  let total = 0;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith("clipbox.")) continue;
    total += key.length + (storage.getItem(key)?.length ?? 0);
  }
  return total;
}

export function storageUsageRatio(chars: number, quota = STORAGE_QUOTA_CHARS): number {
  return quota > 0 ? chars / quota : 1;
}

export function isStorageNearlyFull(storage: Pick<Storage, "length" | "key" | "getItem">): boolean {
  return storageUsageRatio(clipboxStorageChars(storage)) > STORAGE_WARN_RATIO;
}

export async function attemptEditorSave(save: () => Promise<void>) {
  try {
    await save();
    return { saved: true, error: "" } as const;
  } catch (error) {
    return { saved: false, error: isQuotaError(error) ? STORAGE_FULL_MESSAGE : "保存失败，当前内容仍保留，请重试" } as const;
  }
}

export function canHandleHomeShortcuts(
  itemEditorOpen: boolean,
  folderDialogOpen: boolean,
  backupDialogOpen: boolean,
) {
  return !itemEditorOpen && !folderDialogOpen && !backupDialogOpen;
}

export function modalInteractionState(
  itemEditorOpen: boolean,
  folderDialogOpen: boolean,
  backupDialogOpen: boolean,
) {
  const homeShortcutsEnabled = canHandleHomeShortcuts(itemEditorOpen, folderDialogOpen, backupDialogOpen);
  return { homeShortcutsEnabled, backgroundInert: !homeShortcutsEnabled };
}

export function resolveFocusWrapIndex(currentIndex: number, count: number, backward: boolean) {
  if (count <= 0) return -1;
  if (currentIndex < 0) return backward ? count - 1 : 0;
  if (backward && currentIndex === 0) return count - 1;
  if (!backward && currentIndex === count - 1) return 0;
  return -1;
}

export function resolveConnectedFocusTarget<T extends { isConnected: boolean }>(
  preferred: T | null,
  fallback: T | null,
) {
  if (preferred?.isConnected) return preferred;
  return fallback?.isConnected ? fallback : null;
}

export function resolvePostCommitFocusTarget<T extends { isConnected: boolean }>(
  pending: { trigger: T | null } | null,
  itemEditorOpen: boolean,
  backgroundInert: boolean,
  fallback: T | null,
) {
  if (!pending || itemEditorOpen || backgroundInert) return null;
  return resolveConnectedFocusTarget(pending.trigger, fallback);
}

export function resolveSelectedFolder(folders: string[], requested: string, allowCustom = false) {
  const folder = normalizeFolderName(requested);
  if (allowCustom) return folder;
  return folders.includes(folder) ? folder : "";
}

export function resolveRefreshedFolder(folders: string[], activeFolder: string) {
  if (activeFolder === "all" || activeFolder === "pinned" || activeFolder === "recent" || activeFolder === "uncategorized" || activeFolder === "trash") return activeFolder;
  if (activeFolder.startsWith("folder:") && folders.includes(activeFolder.slice(7))) return activeFolder;
  return "all";
}

export function resolveRefreshedActiveFolder(kind: ItemKind, folders: string[], activeFolder: string) {
  const resolved = resolveRefreshedFolder(folders, activeFolder);
  return kind === "snippet" && resolved === "uncategorized" ? "all" : resolved;
}

export const SNIPPET_NOTE_MAX = 40;

// Deterministic tidy-up used on its own when no on-device model is available,
// and after a model rewrite. It never touches [变量] / {变量} tokens.
export function tidyText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line
      .replace(/[ \t\u3000]+/g, " ")
      .trim()
      .replace(/([\u3400-\u9fff\uff09\u300d\u300f\u201d\u300b])\s+(?=[\u3400-\u9fff\uff08\u300c\u300e\u201c\u300a])/g, "$1")
      .replace(/\s+([,;!?])/g, "$1")
      .replace(/\s+:(?=\s|$)/g, ":")
      .replace(/\s+\.(?=\s|$)/g, ".")
      .replace(/\s+([\uff0c\u3002\uff01\uff1f\uff1b\uff1a\u3001\uff09\u300d\u300f\u201d\u300b])/g, "$1")
      .replace(/([\uff08\u300c\u300e\u201c\u300a])\s+/g, "$1")
      .replace(/([,;!?])(?=[A-Za-z])/g, "$1 "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type AiRewriteMode = "polish" | "organize";

export function resolveAiRewrite(startedWithContent: string, currentContent: string, generated: string) {
  if (startedWithContent !== currentContent) return { text: currentContent, stale: true, error: "" };
  const text = generated.trim();
  if (!text) return { text: currentContent, stale: false, error: "暂时无法生成，内容没有改动" };
  if (text === startedWithContent.trim()) return { text: currentContent, stale: false, error: "已经很整齐了，没有需要改的地方" };
  return { text, stale: false, error: "" };
}

export function normalizeFolderName(value: string) {
  return Array.from(value.trim()).slice(0, 30).join("");
}

function normalizeFolderList(values: unknown, extracted: string[]) {
  const source = Array.isArray(values) ? values : [];
  return Array.from(
    new Set(
      [...source, ...extracted]
        .filter((value): value is string => typeof value === "string")
        .map(normalizeFolderName)
        .filter(Boolean),
    ),
  );
}

function normalizeSnippetFolderList(values: unknown, extracted: string[]) {
  const ordered = normalizeFolderList(values, extracted);
  // A saved list that has every standard folder keeps its order, so the standard folders can be sorted too (D-035).
  const present = new Set(ordered);
  if (STANDARD_SNIPPET_FOLDERS.every((folder) => present.has(folder))) return ordered;
  // Anything older or incomplete is rebuilt as before: the standard folders first, then the others.
  const standard = new Set<string>(STANDARD_SNIPPET_FOLDERS);
  return [...STANDARD_SNIPPET_FOLDERS, ...ordered.filter((folder) => !standard.has(folder))];
}

function stripLegacySnippetPriority(item: SecretItem) {
  if (!item.snippetMeta || !("priority" in item.snippetMeta)) return item;
  const snippetMeta: SnippetMeta & { priority?: unknown } = { ...item.snippetMeta };
  delete snippetMeta.priority;
  return { ...item, snippetMeta };
}

function normalizeItem(item: SecretItem) {
  const cleaned = stripLegacySnippetPriority(item);
  const secretSegments = normalizeSecretSegments(cleaned.secretSegments);
  if (secretSegments) return { ...cleaned, secret: combineSecretSegments(secretSegments), secretSegments };
  if (!("secretSegments" in cleaned)) return cleaned;
  const withoutInvalidSegments = { ...cleaned };
  delete withoutInvalidSegments.secretSegments;
  return withoutInvalidSegments;
}

export function normalizeVaultData(payload: unknown): VaultData {
  const items = Array.isArray(payload)
    ? (payload as SecretItem[])
    : payload && typeof payload === "object" && Array.isArray((payload as VaultData).items)
      ? (payload as VaultData).items
      : [];
  const supplied = !Array.isArray(payload) && payload && typeof payload === "object"
    ? (payload as Partial<VaultData>).folders
    : undefined;
  const requestedNext = !Array.isArray(payload) && payload && typeof payload === "object"
    ? (payload as Partial<VaultData>).nextSnippetNumber
    : undefined;
  const normalizedItems = items.map(normalizeItem);
  const extracted = (kind: ItemKind) => normalizedItems
    .filter((item) => (item.kind || "secret") === kind)
    .map((item) => item.folder || "");

  const numbered = normalizeSnippetNumbers(normalizedItems, requestedNext);
  const folders = {
    secret: normalizeFolderList(supplied?.secret, extracted("secret")),
    snippet: normalizeSnippetFolderList(supplied?.snippet, extracted("snippet")),
  };
  const suppliedColors = !Array.isArray(payload) && payload && typeof payload === "object"
    ? (payload as Partial<VaultData>).folderColors
    : undefined;
  const folderColors = normalizeFolderColors(suppliedColors, folders);
  const suppliedSeen = !Array.isArray(payload) && payload && typeof payload === "object"
    ? (payload as Partial<VaultData>).sharedSeen
    : undefined;
  const sharedSeen = Array.isArray(suppliedSeen) ? Array.from(new Set(suppliedSeen.filter((id): id is string => typeof id === "string" && id.length > 0))) : [];
  return {
    items: numbered.items,
    folders,
    nextSnippetNumber: numbered.nextSnippetNumber,
    ...(folderColors ? { folderColors } : {}),
    ...(sharedSeen.length ? { sharedSeen } : {}),
  };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function normalizeFolderColors(value: unknown, folders: FolderRegistry): FolderColors | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result: FolderColors = { secret: {}, snippet: {} };
  let any = false;
  for (const kind of ["secret", "snippet"] as const) {
    const source = (value as Partial<FolderColors>)[kind];
    if (!source || typeof source !== "object") continue;
    for (const [folder, color] of Object.entries(source)) {
      if (typeof color === "string" && HEX_COLOR.test(color) && folders[kind].includes(folder)) {
        result[kind][folder] = color;
        any = true;
      }
    }
  }
  return any ? result : undefined;
}

function isStandardSnippetFolder(kind: ItemKind, folder: string) {
  return kind === "snippet" && (STANDARD_SNIPPET_FOLDERS as readonly string[]).includes(folder);
}

export function folderEditBlocker(kind: ItemKind, folder: string) {
  return isStandardSnippetFolder(kind, folder) ? "标准话术目录不能改名或删除，但可以改颜色" : "";
}

export function renameFolder(data: VaultData, kind: ItemKind, from: string, rawTo: string): { data: VaultData; error?: string } {
  const to = normalizeFolderName(rawTo);
  if (!data.folders[kind].includes(from)) return { data, error: "目录不存在" };
  const blocker = folderEditBlocker(kind, from);
  if (blocker) return { data, error: blocker };
  if (!to) return { data, error: "请输入目录名称" };
  if (to === from) return { data };
  if (data.folders[kind].includes(to)) return { data, error: "已有同名目录" };
  const colors = data.folderColors?.[kind] || {};
  const nextColors = { ...colors };
  if (nextColors[from]) { nextColors[to] = nextColors[from]; delete nextColors[from]; }
  return {
    data: normalizeVaultData({
      ...data,
      folders: { ...data.folders, [kind]: data.folders[kind].map((folder) => folder === from ? to : folder) },
      items: data.items.map((item) => (item.kind || "secret") === kind && item.folder === from
        ? { ...item, folder: to, snippetMeta: item.snippetMeta ? { ...item.snippetMeta, stage: to } : item.snippetMeta }
        : item),
      folderColors: { secret: {}, snippet: {}, ...data.folderColors, [kind]: nextColors },
    }),
  };
}

// Snippets always need a folder, so a snippet folder can only be removed once it is empty;
// secrets fall back to "uncategorized".
export function deleteFolder(data: VaultData, kind: ItemKind, folder: string): { data: VaultData; moved: number; error?: string } {
  if (!data.folders[kind].includes(folder)) return { data, moved: 0, error: "目录不存在" };
  const blocker = folderEditBlocker(kind, folder);
  if (blocker) return { data, moved: 0, error: blocker };
  const inFolder = data.items.filter((item) => (item.kind || "secret") === kind && item.folder === folder);
  if (kind === "snippet" && inFolder.length > 0) return { data, moved: 0, error: `目录里还有 ${inFolder.length} 条话术，请先移走再删除` };
  const nextColors = { ...(data.folderColors?.[kind] || {}) };
  delete nextColors[folder];
  return {
    moved: inFolder.length,
    data: normalizeVaultData({
      ...data,
      folders: { ...data.folders, [kind]: data.folders[kind].filter((value) => value !== folder) },
      items: data.items.map((item) => (item.kind || "secret") === kind && item.folder === folder ? { ...item, folder: "" } : item),
      folderColors: { secret: {}, snippet: {}, ...data.folderColors, [kind]: nextColors },
    }),
  };
}

export function setFolderColor(data: VaultData, kind: ItemKind, folder: string, color: string | null): VaultData {
  if (!data.folders[kind].includes(folder)) return data;
  const nextColors = { ...(data.folderColors?.[kind] || {}) };
  if (color && HEX_COLOR.test(color)) nextColors[folder] = color.toLowerCase();
  else delete nextColors[folder];
  return normalizeVaultData({ ...data, folderColors: { secret: {}, snippet: {}, ...data.folderColors, [kind]: nextColors } });
}

export function moveItemsToFolder(items: SecretItem[], ids: readonly string[], folder: string, now: number) {
  const set = new Set(ids);
  return items.map((item) => set.has(item.id) && !isTrashedItem(item)
    ? { ...item, folder, updatedAt: now, snippetMeta: item.snippetMeta ? { ...item.snippetMeta, stage: folder } : item.snippetMeta }
    : item);
}

export function moveItemsToTrash(items: SecretItem[], ids: readonly string[], deletedAt: number) {
  const set = new Set(ids);
  return items.map((item) => set.has(item.id) && !isTrashedItem(item) ? { ...item, deletedAt } : item);
}

export function restoreTrashedItems(items: SecretItem[], ids: readonly string[]) {
  const set = new Set(ids);
  return items.map((item) => {
    if (!set.has(item.id) || !isTrashedItem(item)) return item;
    const restored = { ...item };
    delete restored.deletedAt;
    return restored;
  });
}

// 撤销 after a save in the editor. `before` is the entry as it was (null: the save created it), `after` is what the save
// wrote. Copying an entry only counts its use (lastUsedAt, useCount), which does not count as a change; anything else
// changed since the save (edited again, pinned, moved, sent to the 回收站, removed) makes undo refuse with null, so a newer
// change is never overwritten. A created entry is removed outright (not sent to the 回收站) and, when nothing was numbered
// after it, its 话术 number is handed out again.
export type ItemSaveRecord = { before: SecretItem | null; after: SecretItem; nextBefore: number; nextAfter: number };
const USAGE_FIELDS = new Set(["lastUsedAt", "useCount"]);
function withoutUsage(item: SecretItem) {
  return Object.fromEntries(Object.entries(item).filter(([key, value]) => !USAGE_FIELDS.has(key) && value !== undefined).sort(([a], [b]) => a.localeCompare(b)));
}
export function unchangedSinceSave(current: SecretItem | undefined, after: SecretItem) {
  return Boolean(current) && JSON.stringify(withoutUsage(current!)) === JSON.stringify(withoutUsage(after));
}
export function undoItemSave(data: VaultData, record: ItemSaveRecord): VaultData | null {
  const id = record.after.id;
  const current = data.items.find((item) => item.id === id);
  if (!unchangedSinceSave(current, record.after)) return null;
  if (!record.before) {
    const nextSnippetNumber = data.nextSnippetNumber === record.nextAfter ? record.nextBefore : data.nextSnippetNumber;
    return { ...data, items: data.items.filter((item) => item.id !== id), nextSnippetNumber };
  }
  // The entry goes back to its earlier fields; how often it was copied stays as it is now.
  const restored: Record<string, unknown> = { ...record.before };
  for (const key of USAGE_FIELDS) {
    const value = (current as Record<string, unknown>)[key];
    if (value === undefined) delete restored[key];
    else restored[key] = value;
  }
  return { ...data, items: data.items.map((item) => item.id === id ? restored as SecretItem : item) };
}

// Splits text into plain and matching pieces for search highlighting; every whitespace-separated term counts.
export function splitSearchHighlight(text: string, query: string): { text: string; hit: boolean }[] {
  const terms = Array.from(new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean)));
  if (!text || terms.length === 0) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    let index = lower.indexOf(term);
    while (index >= 0) {
      for (let i = index; i < index + term.length && i < marks.length; i += 1) marks[i] = true;
      index = lower.indexOf(term, index + term.length);
    }
  }
  const pieces: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const last = pieces[pieces.length - 1];
    if (last && last.hit === marks[i]) last.text += text[i];
    else pieces.push({ text: text[i], hit: marks[i] });
  }
  return pieces;
}

export function synchronizeVaultData(items: SecretItem[], folders: FolderRegistry, nextSnippetNumber = 1, folderColors?: FolderColors, sharedSeen?: string[]): VaultData {
  return normalizeVaultData({ items, folders, nextSnippetNumber, folderColors, sharedSeen });
}

export function addFolder(registry: FolderRegistry, kind: ItemKind, rawName: string) {
  const folder = normalizeFolderName(rawName);
  if (!folder) return { folders: registry, folder: "", created: false };
  if (kind === "snippet") {
    const snippet = normalizeSnippetFolderList(registry.snippet, []);
    if (snippet.includes(folder)) return { folders: { ...registry, snippet }, folder, created: false };
    return {
      folders: { ...registry, snippet: [...snippet, folder] },
      folder,
      created: true,
    };
  }
  if (registry[kind].includes(folder)) return { folders: registry, folder, created: false };
  return {
    folders: {
      ...registry,
      [kind]: [...registry[kind], folder],
    },
    folder,
    created: true,
  };
}

export function mergeFolderRegistries(current: FolderRegistry, incoming: FolderRegistry): FolderRegistry {
  return {
    secret: normalizeFolderList(current.secret, incoming.secret),
    snippet: normalizeSnippetFolderList(current.snippet, incoming.snippet),
  };
}

export function vaultDataForBackupScope(data: VaultData, scope: BackupScope): VaultData {
  const normalized = normalizeVaultData(data);
  return {
    items: normalized.items.filter((item) => (item.kind || "secret") === scope),
    folders: {
      secret: scope === "secret" ? normalized.folders.secret : [],
      snippet: scope === "snippet" ? normalized.folders.snippet : [...STANDARD_SNIPPET_FOLDERS],
    },
    nextSnippetNumber: scope === "snippet" ? normalized.nextSnippetNumber : 1,
    ...(scope === "snippet" && normalized.sharedSeen ? { sharedSeen: normalized.sharedSeen } : {}),
    ...(normalized.folderColors?.[scope] && Object.keys(normalized.folderColors[scope]).length
      ? { folderColors: { secret: {}, snippet: {}, [scope]: normalized.folderColors[scope] } as FolderColors }
      : {}),
  };
}

export function mergeImportedVaultData(
  current: VaultData,
  incoming: VaultData,
  strategy: ImportStrategy,
  createId: () => string,
  scope?: BackupScope,
) {
  const source = scope ? vaultDataForBackupScope(incoming, scope) : incoming;
  if (strategy === "replace") {
    if (!scope) return { data: normalizeVaultData(source), importedCount: source.items.length };
    const retained = current.items.filter((item) => (item.kind || "secret") !== scope);
    const folders = scope === "secret"
      ? { secret: source.folders.secret, snippet: current.folders.snippet }
      : { secret: current.folders.secret, snippet: source.folders.snippet };
    const nextSnippetNumber = scope === "snippet" ? source.nextSnippetNumber : current.nextSnippetNumber;
    const otherKind = scope === "secret" ? "snippet" : "secret";
    const folderColors: FolderColors = { secret: {}, snippet: {}, [otherKind]: current.folderColors?.[otherKind] || {}, [scope]: source.folderColors?.[scope] || {} };
    return {
      data: normalizeVaultData({ items: [...source.items, ...retained], folders, nextSnippetNumber, folderColors, sharedSeen: scope === "snippet" ? [...(current.sharedSeen || []), ...(source.sharedSeen || [])] : current.sharedSeen }),
      importedCount: source.items.length,
    };
  }

  const itemSignature = (item: SecretItem) => `${item.kind || "secret"}\u0000${item.label}\u0000${item.secret}`;
  const signatures = new Set(current.items.map(itemSignature));
  // Signatures whose only current copies are in the trash: an active incoming copy restores one of them.
  const activeSignatures = new Set(current.items.filter((item) => !isTrashedItem(item)).map(itemSignature));
  const restorableIds = new Map<string, string>();
  for (const item of current.items) {
    const signature = itemSignature(item);
    if (isTrashedItem(item) && !activeSignatures.has(signature) && !restorableIds.has(signature)) restorableIds.set(signature, item.id);
  }
  const restoredIds = new Set<string>();
  const ids = new Set(current.items.map((item) => item.id));
  const currentSnippetNumbers = new Set(current.items.flatMap((item) => item.snippetNumber ? [item.snippetNumber] : []));
  const items = source.items
    .filter((item) => {
      const signature = itemSignature(item);
      const restorableId = restorableIds.get(signature);
      if (restorableId && !isTrashedItem(item)) {
        restorableIds.delete(signature);
        restoredIds.add(restorableId);
        return false;
      }
      if (signatures.has(signature)) return false;
      signatures.add(signature);
      return true;
    })
    .map((item) => {
      const candidate = item.snippetNumber && currentSnippetNumbers.has(item.snippetNumber)
        ? { ...item, snippetNumber: undefined }
        : item;
      if (!ids.has(item.id)) {
        ids.add(item.id);
        return candidate;
      }
      const id = createId();
      ids.add(id);
      return { ...candidate, id };
    });

  const currentItems = restoredIds.size ? restoreTrashedItems(current.items, [...restoredIds]) : current.items;
  const data = normalizeVaultData({
    items: [...items, ...currentItems],
    folders: mergeFolderRegistries(current.folders, source.folders),
    nextSnippetNumber: Math.max(current.nextSnippetNumber, source.nextSnippetNumber),
    folderColors: mergeFolderColors(current.folderColors, source.folderColors),
    sharedSeen: [...(current.sharedSeen || []), ...(source.sharedSeen || [])],
  });
  return {
    data,
    importedCount: items.length + restoredIds.size,
  };
}

function mergeFolderColors(current?: FolderColors, incoming?: FolderColors): FolderColors | undefined {
  if (!current && !incoming) return undefined;
  return {
    secret: { ...(incoming?.secret || {}), ...(current?.secret || {}) },
    snippet: { ...(incoming?.snippet || {}), ...(current?.snippet || {}) },
  };
}

// "2026-10-10 21:37" in the viewer's own time zone; "" when the value is missing or not a date.
export function formatBuildTime(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const two = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

// Which cards can step up or down in the shown list, worked out once per list instead of once per row (a long list
// made that slow). Pinned and unpinned cards sort apart, so a card only swaps with a neighbour of its own group.
export type CardMoves = { up: boolean; down: boolean };
export function buildCardMoveMap(list: readonly { id: string; pinned?: boolean }[]): Map<string, CardMoves> {
  const moves = new Map<string, CardMoves>();
  for (const pinned of [true, false]) {
    const group = list.filter((entry) => Boolean(entry.pinned) === pinned);
    group.forEach((entry, index) => {
      if (!moves.has(entry.id)) moves.set(entry.id, { up: index > 0, down: index < group.length - 1 });
    });
  }
  return moves;
}

// How many entries each folder holds, counted in one pass over the list.
export function countItemsByFolder(list: readonly { folder?: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of list) {
    const folder = entry.folder ?? "";
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return counts;
}
