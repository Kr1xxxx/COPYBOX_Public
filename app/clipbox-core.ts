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
  lastUsedAt?: number;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type FolderRegistry = Record<ItemKind, string[]>;
export type VaultData = { items: SecretItem[]; folders: FolderRegistry; nextSnippetNumber: number };
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

export function buildDirectoryShortcuts(items: SecretItem[], kind: ItemKind) {
  const activeItems = selectItemsByTrashState(items, kind, "active");
  return [
    { id: "all", label: kind === "snippet" ? "全部话术" : "全部", count: activeItems.length },
    { id: "pinned", label: "收藏", count: activeItems.filter((item) => item.pinned).length },
  ];
}

export function canAddItemInFolder(activeFolder: string) {
  return activeFolder !== "pinned" && activeFolder !== "trash";
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

export async function attemptEditorSave(save: () => Promise<void>) {
  try {
    await save();
    return { saved: true, error: "" } as const;
  } catch {
    return { saved: false, error: "保存失败，当前内容仍保留，请重试" } as const;
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

export type HomeShortcutAction = "search" | "add" | "edit";

export function homeShortcutAction(
  key: string,
  commandKey: boolean,
  itemEditorOpen: boolean,
  folderDialogOpen: boolean,
  backupDialogOpen: boolean,
): HomeShortcutAction | null {
  if (!commandKey || !canHandleHomeShortcuts(itemEditorOpen, folderDialogOpen, backupDialogOpen)) return null;
  return ({ k: "search", n: "add", e: "edit" } as const)[key.toLowerCase() as "k" | "n" | "e"] || null;
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
  if (activeFolder === "all" || activeFolder === "pinned" || activeFolder === "uncategorized" || activeFolder === "trash") return activeFolder;
  if (activeFolder.startsWith("folder:") && folders.includes(activeFolder.slice(7))) return activeFolder;
  return "all";
}

export function resolveRefreshedActiveFolder(kind: ItemKind, folders: string[], activeFolder: string) {
  const resolved = resolveRefreshedFolder(folders, activeFolder);
  return kind === "snippet" && resolved === "uncategorized" ? "all" : resolved;
}

export function resolveGeneratedSummary(
  startedWithContent: string,
  currentContent: string,
  startedWithSummary: string,
  currentSummary: string,
  generated: string,
) {
  if (startedWithContent !== currentContent || startedWithSummary !== currentSummary) {
    return { summary: currentSummary, stale: true, error: "" };
  }
  const summary = limitChars(generated);
  return summary
    ? { summary, stale: false, error: "" }
    : { summary: currentSummary, stale: false, error: "暂时无法生成，请手动填写" };
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
  const standard = new Set<string>(STANDARD_SNIPPET_FOLDERS);
  const custom = normalizeFolderList(values, extracted).filter((folder) => !standard.has(folder));
  return [...STANDARD_SNIPPET_FOLDERS, ...custom];
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
  return {
    items: numbered.items,
    folders: {
      secret: normalizeFolderList(supplied?.secret, extracted("secret")),
      snippet: normalizeSnippetFolderList(supplied?.snippet, extracted("snippet")),
    },
    nextSnippetNumber: numbered.nextSnippetNumber,
  };
}

export function synchronizeVaultData(items: SecretItem[], folders: FolderRegistry, nextSnippetNumber = 1): VaultData {
  return normalizeVaultData({ items, folders, nextSnippetNumber });
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
    return {
      data: normalizeVaultData({ items: [...source.items, ...retained], folders, nextSnippetNumber }),
      importedCount: source.items.length,
    };
  }

  const signatures = new Set(current.items.map((item) => `${item.kind || "secret"}\u0000${item.label}\u0000${item.secret}`));
  const ids = new Set(current.items.map((item) => item.id));
  const currentSnippetNumbers = new Set(current.items.flatMap((item) => item.snippetNumber ? [item.snippetNumber] : []));
  const items = source.items
    .filter((item) => {
      const signature = `${item.kind || "secret"}\u0000${item.label}\u0000${item.secret}`;
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

  const data = normalizeVaultData({
    items: [...items, ...current.items],
    folders: mergeFolderRegistries(current.folders, source.folders),
    nextSnippetNumber: Math.max(current.nextSnippetNumber, source.nextSnippetNumber),
  });
  return {
    data,
    importedCount: items.length,
  };
}
