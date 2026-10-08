"use client";

import { copyTextWithExpiry } from "./clipboard";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildCategoryColorMap, UNCATEGORIZED_COLOR } from "./category-colors";
import {
  canReorderCards,
  moveName,
  moveVisibleItem,
  reorderNames,
  reorderVisibleItems,
} from "./clipbox-order";
import {
  addFolder,
  attemptEditorSave,
  buildDirectoryShortcuts,
  canAddItemInFolder,
  combineSecretSegments,
  DEFAULT_ITEM_KIND,
  EMPTY_FOLDER_REGISTRY,
  homeShortcutAction,
  itemMatchesActiveFolder,
  limitChars,
  mergeImportedVaultData,
  modalInteractionState,
  normalizeFolderName,
  normalizeReferenceNote,
  normalizeVaultData,
  permanentlyDeleteTrashedItem,
  parseRefreshContext,
  resolveFocusWrapIndex,
  resolveGeneratedSummary,
  resolvePostCommitFocusTarget,
  resolveRefreshedActiveFolder,
  resolveSelectedFolder,
  restoreTrashedItem,
  selectItemsByTrashState,
  splitSecretSegments,
  type FolderRegistry,
  type BackupScope,
  type ImportStrategy,
  type ItemKind,
  type SecretItem,
  synchronizeVaultData,
  type VaultData,
  vaultDataForBackupScope,
  moveItemToTrash,
} from "./clipbox-core";
import {
  buildSnippetImportPreview,
  extractPlaceholders,
  fillSnippetTemplate,
  hasOptionalSnippetPreparation,
  matchesSnippetProduct,
  parseSnippetWorkbook,
  PRODUCT_GROUPS,
  productGroupsForRawProduct,
  resolveSnippetCopySource,
  snippetCopyReadiness,
  snippetSearchText,
  type SnippetImportPreview,
} from "./snippet-import";
import { usePointerReorder } from "./use-pointer-reorder";
import { useSortFlipAnimation } from "./use-sort-flip-animation";
import { AutomationCommandError, commitSnippetAutomationCommand, formatSecretReference, isAutomationReadAction, parseSecretExportCommand } from "./clipbox-automation";
import { STANDARD_SNIPPET_FOLDERS } from "./snippet-folders";

type VaultEnvelope = {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
  iterations: number;
  updatedAt: number;
};

type LegacyDeviceBackup = {
  format: "clipbox-device-backup";
  version: 1;
  deviceKey: string;
  envelope: VaultEnvelope;
};

type SecureBackup =
  | { format: "clipbox-secure-backup"; version: 2; createdAt: number; envelope: VaultEnvelope }
  | { format: "clipbox-secure-backup"; version: 3; scope: BackupScope; createdAt: number; envelope: VaultEnvelope };

type PendingImport = { envelope?: VaultEnvelope; legacyData?: VaultData; scope?: BackupScope };
type BackupMode = "export" | "import";
type CopyLanguage = "en" | "zh";
type SnippetCopyRequest = { item: SecretItem; language: CopyLanguage };
type DeleteRequest = { item: SecretItem; permanent: boolean };
type WindowMode = "full" | "mini";

declare global {
  interface Window {
    clipboxDesktop?: {
      copyText: (text: string) => Promise<void>;
      didCopy: () => void;
      getVersion: () => Promise<string>;
      relaunch: () => void;
      onFocusSearch: (callback: () => void) => () => void;
      onAutomationCommand: (callback: (request: { requestId: string; command: unknown }) => void) => () => void;
      respondAutomationCommand: (requestId: string, response: unknown) => void;
      automationReady: () => void;
      setWindowMode?: (mode: WindowMode) => void;
      onWindowMode?: (callback: (mode: WindowMode) => void) => () => void;
    };
  }
}

const STORAGE_KEY = "clipbox.vault.v1";
const DEVICE_KEY = "clipbox.device-key.v1";
const REFRESH_CONTEXT_KEY = "clipbox:refresh-context";
const ITERATIONS = 310_000;
const COLORS = ["#ffb02e", "#4bc67a", "#4f8df7", "#9b70df", "#ef6d63", "#23b6b0"];

function timestampNow() {
  return Date.now();
}

function localSummary(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  const rules: Array<[RegExp, string]> = [
    [/hair|beautiful|look so good|photo|loved it/i, "夸赞客户美照"],
    [/thank|appreciate|感谢|谢谢/i, "感谢客户分享"],
    [/refund|return|退款|退货/i, "退款处理说明"],
    [/shipping|delivery|tracking|物流|发货/i, "物流进度回复"],
    [/price|quote|wholesale|报价|批发/i, "报价沟通话术"],
    [/cooperat|合作|代理|distributor/i, "合作邀约"],
    [/appointment|booking|预约/i, "预约确认"],
    [/hello|\bhi\b|你好|您好/i, "客户问候"],
  ];
  const matched = rules.find(([pattern]) => pattern.test(text));
  if (matched) return matched[1];
  const clause = text.split(/[。！？!?；;\n]/).find((part) => part.trim()) || text;
  if (Array.from(clause).every((char) => char.charCodeAt(0) <= 127)) return limitChars(clause.split(/\s+/).slice(0, 3).join(" "));
  return limitChars(clause.replace(/[，,：:“”"'（）()]/g, ""));
}

const ICON_PATHS: Record<string, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  mini: <><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><rect x="4" y="13" width="8" height="7" rx="1.5" /></>,
  restore: <><path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" /><path d="M15 4h5v5M20 4l-7 7" /></>,
  grid: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 10h16" /></>,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  more: <><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  shield: <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3z" />,
  chevron: <path d="m6 9 6 6 6-6" />,
};

function Icon({ name, filled = false, className }: { name: keyof typeof ICON_PATHS; filled?: boolean; className?: string }) {
  return (
    <svg className={`icon${className ? ` ${className}` : ""}`} width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  );
}

function SnippetContent({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return <>{parts.map((part, index) => /^\[[^\]]+\]$/.test(part)
    ? <mark key={index} className="snippet-variable">{part}</mark>
    : <span key={index}>{part}</span>)}</>;
}

function SnippetTitle({ label }: { label: string }) {
  const separatorIndex = label.search(/[|｜]/);
  if (separatorIndex < 0) return <>{label}</>;

  const primary = label.slice(0, separatorIndex).trim();
  const detail = label.slice(separatorIndex + 1).trim();
  if (!primary || !detail) return <>{label}</>;

  return <><span className="snippet-title-primary">{primary}</span><span className="snippet-title-separator">｜</span><span className="snippet-title-detail">{detail}</span></>;
}

async function aiSummary(value: string) {
  type LanguageSession = { prompt: (prompt: string) => Promise<string>; destroy?: () => void };
  type LanguageModelAPI = { create: () => Promise<LanguageSession> };
  const model = (window as unknown as { LanguageModel?: LanguageModelAPI }).LanguageModel;
  if (model?.create) {
    let session: LanguageSession | undefined;
    try {
      session = await model.create();
      const result = await session.prompt(`用不超过10个中文字符总结下面这段话术的用途。只返回总结，不要标点和解释：\n${value}`);
      const cleaned = result.replace(/[\n。！？!?,，：:"“”']/g, "").trim();
      if (cleaned) return limitChars(cleaned);
    } catch {
      // Fall through to the private on-device heuristic.
    } finally {
      session?.destroy?.();
    }
  }
  return localSummary(value);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function createDeviceKey() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptVault(data: VaultData, password: string, oldSalt?: string) {
  const salt = oldSalt ? base64ToBytes(oldSalt) : crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    version: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iterations: ITERATIONS,
    updatedAt: Date.now(),
  } satisfies VaultEnvelope;
}

async function decryptVault(envelope: VaultEnvelope, password: string) {
  const key = await deriveKey(password, base64ToBytes(envelope.salt), envelope.iterations);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.ciphertext),
  );
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted));
  return normalizeVaultData(parsed);
}

async function readLocalEncryptedVault() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const storedDeviceKey = localStorage.getItem(DEVICE_KEY);
  if (!raw || !storedDeviceKey) throw new Error("Local vault is unavailable");
  const envelope = JSON.parse(raw) as VaultEnvelope;
  const data = await decryptVault(envelope, storedDeviceKey);
  return { data, deviceKey: storedDeviceKey };
}

function VaultMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`vault-mark ${small ? "small" : ""}`} aria-hidden="true">
      <span className="vault-lid" />
      <span className="vault-body">C</span>
    </span>
  );
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [deviceKey, setDeviceKey] = useState("");
  const [items, setItems] = useState<SecretItem[]>([]);
  const [folders, setFolders] = useState<FolderRegistry>(EMPTY_FOLDER_REGISTRY);
  const [activeKind, setActiveKind] = useState<ItemKind>(DEFAULT_ITEM_KIND);
  const [activeFolder, setActiveFolder] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SecretItem | null>(null);
  const [toast, setToast] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [copiedReferenceId, setCopiedReferenceId] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [folderDialogKind, setFolderDialogKind] = useState<ItemKind | null>(null);
  const [backupMode, setBackupMode] = useState<BackupMode | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [snippetImport, setSnippetImport] = useState<SnippetImportPreview | null>(null);
  const [snippetImportName, setSnippetImportName] = useState("");
  const [copyRequest, setCopyRequest] = useState<SnippetCopyRequest | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [productFilter, setProductFilter] = useState("全部产品");
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [windowMode, setWindowMode] = useState<WindowMode>("full");
  const [revealedId, setRevealedId] = useState("");
  const [rowMenuId, setRowMenuId] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const spreadsheetFileRef = useRef<HTMLInputElement>(null);
  const folderCreateButtonRef = useRef<HTMLButtonElement>(null);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const pendingEditorFocusRef = useRef<{ trigger: HTMLElement | null } | null>(null);
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const referenceFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef<SecretItem[]>([]);
  const foldersRef = useRef<FolderRegistry>(EMPTY_FOLDER_REGISTRY);
  const nextSnippetNumberRef = useRef(1);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const { prepareSortAnimation } = useSortFlipAnimation();

  useEffect(() => {
    let cancelled = false;
    const refreshContext = parseRefreshContext(localStorage.getItem(REFRESH_CONTEXT_KEY));
    localStorage.removeItem(REFRESH_CONTEXT_KEY);

    function finishOpening(data: VaultData, nextDeviceKey: string) {
      if (cancelled) return;
      setDeviceKey(nextDeviceKey);
      itemsRef.current = data.items;
      foldersRef.current = data.folders;
      nextSnippetNumberRef.current = data.nextSnippetNumber;
      setItems(data.items);
      setFolders(data.folders);
      if (refreshContext) {
        setActiveKind(refreshContext.activeKind);
        setActiveFolder(resolveRefreshedActiveFolder(refreshContext.activeKind, data.folders[refreshContext.activeKind], refreshContext.activeFolder));
        setProductFilter(refreshContext.productFilter);
        setQuery(refreshContext.query);
      }
      setLoading(false);
    }

    async function openVault() {
      const raw = localStorage.getItem(STORAGE_KEY);
      const storedDeviceKey = localStorage.getItem(DEVICE_KEY);
      if (!raw) {
        const nextDeviceKey = storedDeviceKey || createDeviceKey();
        const data: VaultData = synchronizeVaultData([], EMPTY_FOLDER_REGISTRY, 1);
        const envelope = await encryptVault(data, nextDeviceKey);
        localStorage.setItem(DEVICE_KEY, nextDeviceKey);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
        finishOpening(data, nextDeviceKey);
        return;
      }
      if (!storedDeviceKey) throw new Error("Local vault key is missing");
      try {
        const openedVault = await readLocalEncryptedVault();
        const opened = openedVault.data;
        finishOpening(opened, openedVault.deviceKey);
      } catch {
        if (!cancelled) {
          setStartupError("本地数据读取失败，原数据和密钥已保留。请重试；如仍失败，请先备份应用数据再排查。");
          setLoading(false);
        }
      }
    }
    void openVault().catch(() => {
      if (!cancelled) {
        setStartupError("本地数据无法打开，原数据和密钥已保留。请重试。");
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.clipboxDesktop?.getVersion()
      .then((version) => { if (!cancelled) setAppVersion(version); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => window.clipboxDesktop?.onWindowMode?.((mode) => {
    setWindowMode(mode === "mini" ? "mini" : "full");
  }), []);

  const activeFolders = useMemo(() => folders[activeKind], [activeKind, folders]);
  const categoryColors = useMemo(() => buildCategoryColorMap(activeFolders), [activeFolders]);
  const activeKindItems = useMemo(() => selectItemsByTrashState(items, activeKind, "active"), [items, activeKind]);
  const trashedKindItems = useMemo(() => selectItemsByTrashState(items, activeKind, "trash"), [items, activeKind]);
  const directoryShortcuts = useMemo(() => buildDirectoryShortcuts(items, activeKind), [items, activeKind]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const kindItems = selectItemsByTrashState(items, activeKind, activeFolder === "trash" ? "trash" : "active");
    const scoped = kindItems.filter((item) => itemMatchesActiveFolder(item, activeFolder));
    const productMatched = activeKind === "snippet" && activeFolder !== "trash"
      ? scoped.filter((item) => matchesSnippetProduct(item, productFilter))
      : scoped;
    const matched = normalized ? productMatched.filter((item) => {
      const searchable = activeKind === "snippet"
        ? snippetSearchText(item)
        : `${item.label} ${item.note} ${item.summary || ""}`;
      return searchable.toLowerCase().includes(normalized);
    }) : productMatched;
    return matched.toSorted((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  }, [items, query, activeKind, activeFolder, productFilter]);

  const safeSelected = Math.min(selected, Math.max(0, filtered.length - 1));
  const auxiliaryDialogOpen = Boolean(snippetImport || copyRequest || deleteRequest);
  const { homeShortcutsEnabled, backgroundInert } = modalInteractionState(modalOpen || auxiliaryDialogOpen, Boolean(folderDialogKind), Boolean(backupMode));
  const cardDragEnabled = activeFolder !== "trash" && canReorderCards(query, productFilter) && !backgroundInert;

  async function persistCardOrder(update: (items: SecretItem[]) => SecretItem[], successMessage = "顺序已更新", animate = false) {
    try {
      await persist((current) => {
        if (animate) prepareSortAnimation("card");
        return { ...current, items: update(current.items) };
      });
      setToast(successMessage);
      window.setTimeout(() => setToast(""), 1800);
    } catch {
      setToast("排序保存失败，原顺序已保留");
      window.setTimeout(() => setToast(""), 2400);
    }
  }

  async function persistFolderOrder(update: (names: string[]) => string[], successMessage = "目录顺序已更新", animate = false) {
    try {
      await persist((current) => {
        if (animate) prepareSortAnimation("folder");
        return { ...current, folders: { ...current.folders, [activeKind]: update(current.folders[activeKind]) } };
      });
      setToast(successMessage);
      window.setTimeout(() => setToast(""), 1800);
    } catch {
      setToast("目录排序保存失败，原顺序已保留");
      window.setTimeout(() => setToast(""), 2400);
    }
  }

  const cardReorder = usePointerReorder({
    enabled: cardDragEnabled,
    scope: "card",
    onDrop: (sourceId, targetId) => persistCardOrder(
      (latest) => reorderVisibleItems(latest, filtered.map((item) => item.id), sourceId, targetId),
      "顺序已更新",
      true,
    ),
  });
  const folderReorder = usePointerReorder({
    enabled: !backgroundInert,
    scope: "folder",
    onDrop: (source, target) => persistFolderOrder((latest) => reorderNames(latest, source, target), "目录顺序已更新", true),
  });
  const cancelCardDrag = cardReorder.cancelPointerDrag;
  const cancelFolderDrag = folderReorder.cancelPointerDrag;

  useEffect(() => {
    cancelCardDrag();
    cancelFolderDrag();
  }, [activeFolder, activeKind, backupMode, cancelCardDrag, cancelFolderDrag, copyRequest, deleteRequest, folderDialogKind, modalOpen, productFilter, query, snippetImport]);

  function handleCardSortKey(event: React.KeyboardEvent<HTMLButtonElement>, itemId: string) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const next = (latest: SecretItem[]) => moveVisibleItem(
      latest,
      filtered.map((item) => item.id),
      itemId,
      event.key === "ArrowUp" ? -1 : 1,
    );
    void persistCardOrder(next, event.key === "ArrowUp" ? "已向上移动" : "已向下移动");
  }

  function handleFolderSortKey(event: React.KeyboardEvent<HTMLButtonElement>, folder: string) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const next = (latest: string[]) => moveName(latest, folder, event.key === "ArrowUp" ? -1 : 1);
    void persistFolderOrder(next, event.key === "ArrowUp" ? "目录已向上移动" : "目录已向下移动");
  }

  async function refreshLocalVault() {
    if (refreshing) return;
    cancelCardDrag();
    cancelFolderDrag();
    setRefreshing(true);
    let relaunching = false;
    try {
      await persistQueueRef.current.catch(() => undefined);
      const opened = await readLocalEncryptedVault();
      const nextActiveFolder = resolveRefreshedActiveFolder(activeKind, opened.data.folders[activeKind], activeFolder);
      if (window.clipboxDesktop?.relaunch) {
        localStorage.setItem(REFRESH_CONTEXT_KEY, JSON.stringify({
          activeKind,
          activeFolder: nextActiveFolder,
          productFilter,
          query,
        }));
        setToast("正在重新加载…");
        window.clipboxDesktop.relaunch();
        relaunching = true;
        return;
      }
      setDeviceKey(opened.deviceKey);
      itemsRef.current = opened.data.items;
      foldersRef.current = opened.data.folders;
      nextSnippetNumberRef.current = opened.data.nextSnippetNumber;
      setItems(opened.data.items);
      setFolders(opened.data.folders);
      setActiveFolder(nextActiveFolder);
      setToast("已刷新");
      window.setTimeout(() => setToast(""), 1800);
    } catch {
      localStorage.removeItem(REFRESH_CONTEXT_KEY);
      setToast("刷新失败，当前数据未改变");
      window.setTimeout(() => setToast(""), 2400);
    } finally {
      if (!relaunching) setRefreshing(false);
    }
  }

  function openEditor(item: SecretItem | null) {
    editorTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(item);
    setModalOpen(true);
  }

  function closeEditor() {
    pendingEditorFocusRef.current = { trigger: editorTriggerRef.current };
    setModalOpen(false);
    setEditing(null);
  }

  useEffect(() => {
    const pending = pendingEditorFocusRef.current;
    if (!pending || modalOpen || backgroundInert) return;
    pendingEditorFocusRef.current = null;
    resolvePostCommitFocusTarget(pending, modalOpen, backgroundInert, searchRef.current)?.focus();
  }, [modalOpen, backgroundInert]);

  useEffect(() => {
    if (loading) return;
    const shortcut = (event: KeyboardEvent) => {
      const commandKey = event.metaKey || event.ctrlKey;
      const homeShortcut = commandKey && ["k", "n", "e"].includes(event.key.toLowerCase());
      if (!homeShortcutsEnabled) {
        if (homeShortcut) event.preventDefault();
        return;
      }
      const action = homeShortcutAction(event.key, commandKey, modalOpen || auxiliaryDialogOpen, Boolean(folderDialogKind), Boolean(backupMode));
      if (action === "search") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (action === "add") {
        event.preventDefault();
        if (windowMode === "mini") { setWindowMode("full"); window.clipboxDesktop?.setWindowMode?.("full"); }
        openEditor(null);
      }
      if (action === "edit" && activeFolder !== "trash" && filtered[safeSelected]) {
        event.preventDefault();
        if (windowMode === "mini") { setWindowMode("full"); window.clipboxDesktop?.setWindowMode?.("full"); }
        openEditor(filtered[safeSelected]);
      }
      if (event.key === "Escape" && !modalOpen && !auxiliaryDialogOpen) {
        setQuery("");
        setMenuOpen(false);
        setProductMenuOpen(false);
        setRowMenuId("");
        searchRef.current?.blur();
      }
    };
    const removeDesktopListener = window.clipboxDesktop?.onFocusSearch(() => {
      if (homeShortcutAction("k", true, modalOpen || auxiliaryDialogOpen, Boolean(folderDialogKind), Boolean(backupMode)) !== "search") return;
      setActiveFolder("all");
      setQuery("");
      window.setTimeout(() => searchRef.current?.focus(), 30);
    });
    window.addEventListener("keydown", shortcut);
    return () => {
      window.removeEventListener("keydown", shortcut);
      removeDesktopListener?.();
    };
  }, [loading, modalOpen, auxiliaryDialogOpen, folderDialogKind, backupMode, homeShortcutsEnabled, filtered, safeSelected, activeFolder, windowMode]);

  const readVault = useCallback((): VaultData => ({
    items: itemsRef.current,
    folders: foldersRef.current,
    nextSnippetNumber: nextSnippetNumberRef.current,
  }), []);

  // Both UI changes and external commands compute their update inside this queue.
  const enqueueVaultTask = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const queued = persistQueueRef.current.catch(() => undefined).then(task);
    persistQueueRef.current = queued.then(() => undefined, () => undefined);
    return queued;
  }, []);

  const writeVault = useCallback(async (nextData: VaultData) => {
    const data = synchronizeVaultData(nextData.items, nextData.folders, nextData.nextSnippetNumber);
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as VaultEnvelope | null;
    const envelope = await encryptVault(data, deviceKey, current?.salt);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    itemsRef.current = data.items;
    foldersRef.current = data.folders;
    nextSnippetNumberRef.current = data.nextSnippetNumber;
    setItems(data.items);
    setFolders(data.folders);
  }, [deviceKey]);

  const persist = useCallback((update: (current: VaultData) => VaultData) => (
    enqueueVaultTask(() => writeVault(update(readVault())))
  ), [enqueueVaultTask, readVault, writeVault]);

  useEffect(() => {
    if (loading || !deviceKey || !window.clipboxDesktop?.onAutomationCommand) return;
    const remove = window.clipboxDesktop.onAutomationCommand(({ requestId, command }) => {
      const execute = async () => {
        try {
          const secretExport = parseSecretExportCommand(command);
          if (secretExport) {
            const currentData = {
              items: itemsRef.current,
              folders: foldersRef.current,
              nextSnippetNumber: nextSnippetNumberRef.current,
            };
            const secretData = vaultDataForBackupScope(currentData, "secret");
            const envelope = await encryptVault(secretData, secretExport.password);
            const backup: SecureBackup = {
              format: "clipbox-secure-backup",
              version: 3,
              scope: "secret",
              createdAt: Date.now(),
              envelope,
            };
            window.clipboxDesktop?.respondAutomationCommand(requestId, {
              ok: true,
              action: "secret-export",
              secretCount: secretData.items.length,
              backup,
            });
            setToast("秘密加密备份已生成");
            window.setTimeout(() => setToast(""), 2200);
            return;
          }
          const committed = await commitSnippetAutomationCommand(
            {
              items: itemsRef.current,
              folders: foldersRef.current,
              nextSnippetNumber: nextSnippetNumberRef.current,
            },
            command,
            { createId: () => crypto.randomUUID(), now: timestampNow },
            writeVault,
          );
          window.clipboxDesktop?.respondAutomationCommand(requestId, committed.response);
          if (!isAutomationReadAction(committed.response.action)) {
            const number = committed.response.action === "delete"
              ? committed.response.number
              : "item" in committed.response ? committed.response.item.number : "";
            const verb = committed.response.action === "add"
              ? "已新增"
              : committed.response.action === "delete" ? "已移入回收站" : "已更新";
            setToast(`外部任务${verb} ${number}`);
            window.setTimeout(() => setToast(""), 2200);
          }
        } catch (error) {
          const code = error instanceof AutomationCommandError ? error.code : "PERSIST_FAILED";
          const message = error instanceof Error ? error.message : "外部命令执行失败";
          window.clipboxDesktop?.respondAutomationCommand(requestId, { ok: false, error: { code, message } });
          setToast("外部修改失败");
          window.setTimeout(() => setToast(""), 2400);
        }
      };
      void enqueueVaultTask(execute);
    });
    window.clipboxDesktop.automationReady();
    return remove;
  }, [deviceKey, enqueueVaultTask, loading, writeVault]);

  async function finishCopy(item: SecretItem, copied: string) {
    await copyTextWithExpiry(copied);
    void persist((current) => ({ ...current, items: current.items.map((value) => value.id === item.id ? { ...value, lastUsedAt: timestampNow() } : value) })).catch(() => setToast("已复制，但使用记录保存失败"));
    setCopiedId(item.id);
    if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current);
    copyFeedbackTimer.current = window.setTimeout(() => setCopiedId(""), 1250);
    window.clipboxDesktop?.didCopy();

  }

  async function copySecretReference(item: SecretItem) {
    await copyTextWithExpiry(formatSecretReference(item.id));
    setCopiedReferenceId(item.id);
    if (referenceFeedbackTimer.current) clearTimeout(referenceFeedbackTimer.current);
    referenceFeedbackTimer.current = window.setTimeout(() => setCopiedReferenceId(""), 1600);
    setToast("引用已复制，可直接发给其他任务");
    window.setTimeout(() => setToast(""), 2200);
    window.clipboxDesktop?.didCopy();
  }

  async function copy(item: SecretItem, language: CopyLanguage = "en") {
    const source = resolveSnippetCopySource(item, language);
    if (!source) return;
    await finishCopy(item, source);
  }

  function prepareCopy(item: SecretItem, language: CopyLanguage = "en") {
    if (!resolveSnippetCopySource(item, language)) return;
    setCopyRequest({ item, language });
  }

  function handleSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setSelected((value) => Math.min(Math.max(0, filtered.length - 1), value + 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setSelected((value) => Math.max(0, value - 1)); }
    if (event.key === "Enter" && activeFolder !== "trash" && filtered[safeSelected]) { event.preventDefault(); void copy(filtered[safeSelected]); }
    if (event.key === "Escape") { setQuery(""); searchRef.current?.blur(); }
  }

  async function saveItem(data: Omit<SecretItem, "id" | "createdAt" | "updatedAt">) {
    const now = timestampNow();
    const wasEditing = Boolean(editing);
    if (editing) {
      await persist((current) => ({ ...current, items: current.items.map((item) => item.id === editing.id ? { ...item, ...data, updatedAt: now } : item) }));
    } else {
      await persist((current) => ({ ...current, items: [{ ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now }, ...current.items] }));
    }
    closeEditor();
    setToast(wasEditing ? "条目已更新" : "条目已加密保存");
    window.setTimeout(() => setToast(""), 2200);
  }

  async function createFolder(kind: ItemKind, rawName: string) {
    const result = addFolder(foldersRef.current, kind, rawName);
    if (!result.folder) return { created: false, folder: "", error: "请输入目录名称" };
    try {
      if (result.created) await persist((current) => ({ ...current, folders: addFolder(current.folders, kind, rawName).folders }));
      setActiveFolder(`folder:${result.folder}`);
      setSelected(0);
      setToast(result.created ? "目录已创建" : "目录已存在，已打开");
      window.setTimeout(() => setToast(""), 2200);
      return { created: result.created, folder: result.folder };
    } catch {
      return { created: false, folder: result.folder, error: "创建失败，请重试" };
    }
  }

  function closeFolderDialog() {
    setFolderDialogKind(null);
    window.setTimeout(() => folderCreateButtonRef.current?.focus(), 0);
  }

  function requestTrash(item: SecretItem) {
    closeEditor();
    setDeleteRequest({ item, permanent: false });
  }

  async function confirmDelete() {
    if (!deleteRequest) return;
    await persist((current) => ({ ...current, items: deleteRequest.permanent
      ? permanentlyDeleteTrashedItem(current.items, deleteRequest.item.id)
      : moveItemToTrash(current.items, deleteRequest.item.id, timestampNow()) }));
    setDeleteRequest(null);
    setSelected(0);
    setToast(deleteRequest.permanent ? "已永久删除" : "已移入回收站");
    window.setTimeout(() => setToast(""), 2200);
  }

  async function restoreItem(item: SecretItem) {
    try {
      await persist((current) => ({ ...current, items: restoreTrashedItem(current.items, item.id) }));
      setSelected(0);
      setToast("已恢复到原目录");
      window.setTimeout(() => setToast(""), 2200);
    } catch {
      setToast("恢复失败，内容仍保留在回收站");
      window.setTimeout(() => setToast(""), 2400);
    }
  }

  function togglePinned(item: SecretItem) {
    void persist((current) => ({ ...current, items: current.items.map((value) => value.id === item.id ? { ...value, pinned: !value.pinned } : value) })).catch(() => setToast("收藏保存失败，请重试"));
  }

  function switchKind(kind: ItemKind) {
    if (kind === activeKind) return;
    setActiveKind(kind);
    setActiveFolder("all");
    setProductFilter("全部产品");
    setQuery("");
    setSelected(0);
    setRowMenuId("");
    setRevealedId("");
  }

  function selectFolder(folder: string) {
    setActiveFolder(folder);
    if (folder === "trash") setProductFilter("全部产品");
    setSelected(0);
    setRowMenuId("");
    setRevealedId("");
  }

  function selectRow(index: number) {
    setSelected(index);
    setRowMenuId("");
    setRevealedId("");
  }

  function requestWindowMode(mode: WindowMode) {
    setWindowMode(mode);
    setMenuOpen(false);
    setProductMenuOpen(false);
    setRowMenuId("");
    setRevealedId("");
    if (mode === "mini" && activeFolder === "trash") setActiveFolder("all");
    window.clipboxDesktop?.setWindowMode?.(mode);
    window.setTimeout(() => searchRef.current?.focus(), 60);
  }

  async function moveItemToFolder(item: SecretItem, folder: string) {
    setRowMenuId("");
    try {
      await persist((current) => ({ ...current, items: current.items.map((value) => value.id === item.id ? { ...value, folder, updatedAt: timestampNow() } : value) }));
      setToast(folder ? `已移动到「${folder}」` : "已移到未分类");
      window.setTimeout(() => setToast(""), 2000);
    } catch {
      setToast("移动失败，条目保持原位");
      window.setTimeout(() => setToast(""), 2400);
    }
  }

  useEffect(() => {
    document.querySelector(`[data-row-index="${safeSelected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [safeSelected, windowMode, activeFolder, activeKind]);

  async function exportVault(password: string) {
    const currentData = { items: itemsRef.current, folders: foldersRef.current, nextSnippetNumber: nextSnippetNumberRef.current };
    const snippetData = vaultDataForBackupScope(currentData, "snippet");
    const envelope = await encryptVault(snippetData, password);
    const backup: SecureBackup = { format: "clipbox-secure-backup", version: 3, scope: "snippet", createdAt: Date.now(), envelope };
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `clipbox-snippets-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupMode(null);
    setToast("话术备份已导出");
    window.setTimeout(() => setToast(""), 2200);
  }

  async function importVault(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as SecureBackup | LegacyDeviceBackup | VaultEnvelope;
      if ("format" in parsed && parsed.format === "clipbox-secure-backup") {
        if (!parsed.envelope?.ciphertext || !parsed.envelope?.salt) throw new Error();
        if (parsed.version === 3) {
          if (parsed.scope !== "snippet" && parsed.scope !== "secret") throw new Error();
          setPendingImport({ envelope: parsed.envelope, scope: parsed.scope });
        } else if (parsed.version === 2) {
          setPendingImport({ envelope: parsed.envelope });
        } else {
          throw new Error();
        }
      } else if ("format" in parsed && parsed.format === "clipbox-device-backup") {
        const opened = await decryptVault(parsed.envelope, parsed.deviceKey);
        setPendingImport({ legacyData: opened });
      } else {
        const envelope = parsed as VaultEnvelope;
        if (envelope.version !== 1 || !envelope.ciphertext || !envelope.salt) throw new Error();
        setPendingImport({ envelope });
      }
      setBackupMode("import");
      setMenuOpen(false);
    } catch {
      window.alert("这不是有效的 Clipbox 加密备份。");
    }
  }

  async function applyImport(password: string, strategy: ImportStrategy) {
    if (!pendingImport) return;
    const importedData = pendingImport.legacyData || await decryptVault(pendingImport.envelope as VaultEnvelope, password);
    const result = await enqueueVaultTask(async () => {
      const result = mergeImportedVaultData(
        readVault(),
        importedData,
        strategy,
        () => crypto.randomUUID(),
        pendingImport.scope,
      );
      await writeVault(result.data);
      return result;
    });
    setPendingImport(null);
    setBackupMode(null);
    setToast(strategy === "replace" ? `已恢复 ${result.importedCount} 条内容` : `已安全导入 ${result.importedCount} 条内容`);
    window.setTimeout(() => setToast(""), 2400);
  }

  async function prepareSnippetImport(file: File) {
    try {
      const rows = parseSnippetWorkbook(await file.arrayBuffer(), file.name);
      const preview = buildSnippetImportPreview(rows, itemsRef.current, () => crypto.randomUUID(), timestampNow());
      setSnippetImport(preview);
      setSnippetImportName(file.name);
      setMenuOpen(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "无法读取这份话术表格");
    }
  }

  async function applySnippetImport() {
    if (!snippetImport || snippetImport.importableCount === 0) return;
    await persist((current) => ({
      ...current,
      items: [...snippetImport.items, ...current.items],
      folders: { secret: current.folders.secret, snippet: Array.from(new Set([...current.folders.snippet, ...snippetImport.folders])) },
    }));
    const importedCount = snippetImport.importableCount;
    setSnippetImport(null);
    setSnippetImportName("");
    setActiveKind("snippet");
    setActiveFolder("all");
    setProductFilter("全部产品");
    setQuery("");
    setSelected(0);
    setToast(`已导入 ${importedCount} 条话术`);
    window.setTimeout(() => setToast(""), 2600);
  }

  if (startupError) return <main className="loading-page startup-error"><VaultMark /><strong>Clipbox 无法打开数据</strong><span>{startupError}</span><button onClick={() => window.location.reload()}>重试</button></main>;
  if (loading) return <main className="loading-page"><VaultMark /><span>正在打开 Clipbox…</span></main>;

  const isMini = windowMode === "mini";
  const sectionTitle = activeFolder === "all"
    ? (activeKind === "snippet" ? "全部话术" : "全部秘密")
    : activeFolder === "pinned" ? "收藏"
      : activeFolder === "trash" ? "回收站"
        : activeFolder === "uncategorized" ? "未分类"
          : activeFolder.slice(7);
  const searchPlaceholder = activeFolder === "trash" ? "搜索回收站" : activeKind === "secret" ? "搜索秘密标题" : "搜索标题、编号或内容";
  const kindSwitch = (
    <div className={`kind-switch ${isMini ? "compact" : ""}`} role="group" aria-label="内容板块">
      {(["snippet", "secret"] as const).map((kind) => <button key={kind} type="button" className={activeKind === kind ? "active" : ""} aria-pressed={activeKind === kind} onClick={() => switchKind(kind)}>{kind === "snippet" ? "话术" : "秘密"}</button>)}
    </div>
  );
  const searchInput = <input ref={searchRef} value={query} onChange={(e) => { setQuery(e.target.value); setSelected(0); setRowMenuId(""); }} onKeyDown={handleSearchKey} aria-label={searchPlaceholder} placeholder={isMini ? (activeKind === "secret" ? "搜索秘密" : "搜索话术") : searchPlaceholder} />;
  const emptyState = (
    <div className="native-empty"><strong>{query ? "没有匹配的内容" : activeFolder === "trash" ? "回收站是空的" : activeFolder === "pinned" ? "还没有收藏内容" : "这个目录还是空的"}</strong><span>{query ? "换个词搜索试试" : activeFolder === "trash" ? "删除的内容会加密保留在这里" : activeFolder === "pinned" ? "点条目右侧的星标添加收藏" : isMini ? "回到完整窗口添加第一条" : "点右上角的「新增」添加第一条"}</span></div>
  );

  return (
    <main className={`desktop-stage ${isMini ? "mini-stage" : ""}`}>
      <section className={`app-shell ${isMini ? "mini" : "full"} ${backgroundInert ? "editing" : ""}`} inert={backgroundInert}>
        {isMini ? <>
          <header className="mini-top drag-region">
            <div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div>
            {kindSwitch}
            <button type="button" className="icon-button" onClick={() => requestWindowMode("full")} aria-label="恢复完整窗口" title="恢复完整窗口"><Icon name="restore" /></button>
          </header>
          <div className="mini-search">
            <div className="native-search">
              <Icon name="search" className="search-glyph" />
              {searchInput}
              <label className="mini-folder">
                <span className="sr-only">目录</span>
                <select value={activeFolder} onChange={(event) => selectFolder(event.target.value)}>
                  <option value="all">全部</option>
                  <option value="pinned">收藏</option>
                  {activeFolders.map((folder) => <option key={folder} value={`folder:${folder}`}>{folder}</option>)}
                  {activeKind === "secret" && <option value="uncategorized">未分类</option>}
                </select>
                <Icon name="chevron" />
              </label>
            </div>
          </div>
          <div key={`mini:${activeKind}:${activeFolder}`} className="native-list mini-list list-switch">
            {filtered.length === 0 ? emptyState : filtered.map((item, index) => {
              const isSelected = safeSelected === index;
              return (
                <article key={item.id} data-row-index={index} className={`native-row mini-row ${activeKind === "snippet" ? "snippet-row" : "secret-row"} ${isSelected ? "selected" : ""} ${copiedId === item.id ? "copied" : ""}`}>
                  <button type="button" className="row-main" onClick={() => { setSelected(index); void copy(item); }} aria-label={copiedId === item.id ? `已复制 ${item.label}` : `复制 ${item.label}`}>
                    <i className="row-dot" aria-hidden="true" style={{ background: categoryColors[item.folder || ""] || UNCATEGORIZED_COLOR }} />
                    <span className="row-copy">
                      <strong className={activeKind === "snippet" ? "snippet-label" : undefined}>{activeKind === "snippet" ? <SnippetTitle label={item.label} /> : item.label}</strong>
                      {activeKind === "snippet" && <small className="snippet-preview" lang="en">{item.secret}</small>}
                    </span>
                    {item.pinned && <Icon name="star" filled className="row-star" />}
                    {copiedId === item.id ? <span className="mini-copied">已复制</span> : isSelected && <kbd className="enter-key">↵</kbd>}
                  </button>
                  {copiedId === item.id && <span className="copy-status" role="status" aria-live="polite">已复制</span>}
                </article>
              );
            })}
          </div>
          <footer className="status-bar">
            <span><kbd>↵</kbd>复制</span>
            <span><kbd>⌘E</kbd>编辑</span>
            <span className="spacer" />
            <span>{filtered.length} 条</span>
          </footer>
        </> : <>
          <aside className="sidebar" aria-label="目录">
            <div className="sidebar-top drag-region"><div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div></div>
            {kindSwitch}
            <nav className="nav-list" aria-label="快捷入口">
              {directoryShortcuts.map((shortcut) => <button key={shortcut.id} type="button" className={`nav-item ${activeFolder === shortcut.id ? "active" : ""}`} onClick={() => selectFolder(shortcut.id)}><span className="nav-icon"><Icon name={shortcut.id === "pinned" ? "star" : "grid"} className={shortcut.id === "all" ? "accent" : undefined} /></span><span className="nav-label">{shortcut.id === "all" ? "全部" : shortcut.label}</span><b>{shortcut.count}</b></button>)}
            </nav>
            <div className="nav-heading">
              <span>目录</span>
              <button ref={folderCreateButtonRef} type="button" onClick={() => setFolderDialogKind(activeKind)} aria-label="新建目录" title="新建目录"><Icon name="plus" /></button>
            </div>
            <div className="nav-scroll directory-list">
              {activeKind === "snippet" ? activeFolders.map((folder) => <div key={folder} className={`directory-row fixed ${activeFolder === `folder:${folder}` ? "active" : ""}`}><button type="button" className="nav-item directory-main" onClick={() => selectFolder(`folder:${folder}`)} title={folder}><span className="nav-icon"><i className="directory-color-marker" aria-hidden="true" style={{ background: categoryColors[folder] }} /></span><span className="nav-label">{folder}</span><b>{activeKindItems.filter((item) => item.folder === folder).length}</b></button></div>) : <>
                {activeFolders.map((folder) => <div key={folder} data-sort-scope="folder" data-sort-id={folder} className={`directory-row ${activeFolder === `folder:${folder}` ? "active" : ""} ${folderReorder.draggingId === folder ? "dragging" : ""} ${folderReorder.overId === folder && folderReorder.draggingId !== folder ? "drag-over" : ""}`}><button type="button" className="nav-item directory-main" onClick={() => selectFolder(`folder:${folder}`)} title={folder}><span className="nav-icon"><i className="directory-color-marker" aria-hidden="true" style={{ background: categoryColors[folder] }} /></span><span className="nav-label">{folder}</span><b>{activeKindItems.filter((item) => item.folder === folder).length}</b></button><button type="button" className="folder-drag-handle" aria-label={`拖动目录 ${folder}`} title="拖动排序，或按 Option 加方向键" onPointerDown={(event) => folderReorder.beginPointerDrag(event, folder)} onKeyDown={(event) => handleFolderSortKey(event, folder)}><span aria-hidden="true">⠿</span></button></div>)}
                <div className={`directory-row fixed ${activeFolder === "uncategorized" ? "active" : ""}`}><button type="button" className="nav-item directory-main" onClick={() => selectFolder("uncategorized")}><span className="nav-icon"><i className="directory-color-marker hollow" aria-hidden="true" /></span><span className="nav-label">未分类</span><b>{activeKindItems.filter((item) => !item.folder?.trim()).length}</b></button></div>
              </>}
            </div>
            <div className="nav-footer">
              <button type="button" className={`nav-item ${activeFolder === "trash" ? "active" : ""}`} onClick={() => selectFolder("trash")}><span className="nav-icon"><Icon name="trash" /></span><span className="nav-label">回收站</span>{trashedKindItems.length > 0 && <b>{trashedKindItems.length}</b>}</button>
              <div className="menu-wrap sidebar-menu-wrap">
                <button type="button" className={`nav-item ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="设置"><span className="nav-icon"><Icon name="settings" /></span><span className="nav-label">设置</span></button>
                {menuOpen && <div className="dropdown" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setBackupMode("export"); setMenuOpen(false); }}>导出话术备份</button>
                  <button type="button" role="menuitem" onClick={() => { fileRef.current?.click(); setMenuOpen(false); }}>导入备份</button>
                  <button type="button" role="menuitem" onClick={() => { spreadsheetFileRef.current?.click(); setMenuOpen(false); }}>导入话术表格</button>
                  <button type="button" role="menuitem" className={`refresh-button ${refreshing ? "refreshing" : ""}`} onClick={() => { setMenuOpen(false); void refreshLocalVault(); }} disabled={refreshing}><span aria-hidden="true">↻</span>{refreshing ? "正在重新加载…" : "重新加载"}</button>
                  <div className="settings-version">{appVersion ? `版本 v${appVersion}` : "开发版本"}</div>
                </div>}
              </div>
              <input ref={fileRef} className="hidden-input" type="file" accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importVault(file); event.target.value = ""; }} />
              <input ref={spreadsheetFileRef} className="hidden-input" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepareSnippetImport(file); event.target.value = ""; }} />
            </div>
          </aside>

          <section className="content-panel">
            <header className="toolbar drag-region">
              <div className="native-search">
                <Icon name="search" className="search-glyph" />
                {searchInput}
                <kbd>⌘K</kbd>
              </div>
              {canAddItemInFolder(activeFolder) && <button type="button" className="primary-button add-button" onClick={() => openEditor(null)} aria-label="新增条目"><Icon name="plus" />新增</button>}
              <button type="button" className="icon-button" onClick={() => requestWindowMode("mini")} aria-label="迷你模式" title="迷你模式"><Icon name="mini" /></button>
            </header>
            <div className="section-head">
              <h1>{sectionTitle}</h1>
              <span className="section-count">{filtered.length}</span>
              <span className="spacer" />
              {activeKind === "snippet" && activeFolder !== "trash" && <div className="product-filter-wrap">
                <button type="button" className={productFilter !== "全部产品" ? "product-filter active" : "product-filter"} onClick={() => setProductMenuOpen((value) => !value)} aria-expanded={productMenuOpen}>{productFilter}<Icon name="chevron" /></button>
                {productMenuOpen && <div className="product-filter-menu" role="menu">
                  {["全部产品", ...PRODUCT_GROUPS].map((product) => <button type="button" role="menuitem" className={productFilter === product ? "active" : ""} key={product} onClick={() => { setProductFilter(product); setProductMenuOpen(false); setSelected(0); }}>{product}<span>{productFilter === product ? "✓" : ""}</span></button>)}
                </div>}
              </div>}
              {activeKind === "secret" && activeFolder !== "trash" && <span className="section-note"><Icon name="lock" />本机加密</span>}
            </div>
            <div key={`${activeKind}:${activeFolder}`} className="native-list list-switch">
              {filtered.length === 0 ? emptyState : activeFolder === "trash" ? filtered.map((item, index) => (
                <article key={item.id} data-row-index={index} className={`native-row trash-row ${activeKind === "snippet" ? "snippet-row" : "secret-row"} ${safeSelected === index ? "selected" : ""}`}>
                  <span className="trash-row-icon" aria-hidden="true"><Icon name="trash" /></span>
                  <div className="row-main trash-row-main">
                    <span className="row-copy"><strong className={activeKind === "snippet" ? "snippet-label" : undefined}>{activeKind === "snippet" ? <SnippetTitle label={item.label} /> : item.label}</strong><small>{item.folder || "未分类"}</small></span>
                  </div>
                  <button type="button" className="trash-restore" onClick={() => void restoreItem(item)} aria-label={`恢复 ${item.label}`}>恢复</button>
                  <button type="button" className="trash-permanent" onClick={() => setDeleteRequest({ item, permanent: true })} aria-label={`永久删除 ${item.label}`}>永久删除</button>
                </article>
              )) : filtered.map((item, index) => {
                const isSelected = safeSelected === index;
                const isSnippet = activeKind === "snippet";
                const revealed = revealedId === item.id;
                const moveTargets = [...activeFolders, ...(isSnippet ? [] : [""])].filter((folder) => folder !== (item.folder || ""));
                return (
                  <article key={item.id} data-row-index={index} data-sort-scope="card" data-sort-id={item.id} className={`native-row ${isSnippet ? "snippet-row" : "secret-row"} ${item.pinned ? "pinned" : ""} ${isSelected ? "selected" : ""} ${copiedId === item.id ? "copied" : ""} ${copiedReferenceId === item.id ? "reference-copied" : ""} ${cardReorder.draggingId === item.id ? "dragging" : ""} ${cardReorder.overId === item.id && cardReorder.draggingId !== item.id ? "drag-over" : ""}`}>
                    <div className="row-line">
                      <button type="button" className="drag-handle" disabled={!cardDragEnabled} aria-label={`拖动排序 ${item.label}`} title={cardDragEnabled ? "拖动排序，或按 Option 加方向键" : "清除搜索和筛选后可排序"} onPointerDown={(event) => cardReorder.beginPointerDrag(event, item.id)} onKeyDown={(event) => handleCardSortKey(event, item.id)}><i style={{ background: categoryColors[item.folder || ""] || UNCATEGORIZED_COLOR }} /></button>
                      <button type="button" className="row-main" onClick={() => selectRow(index)} onDoubleClick={() => void copy(item)} aria-expanded={isSelected} aria-label={`${isSelected ? "已展开" : "展开"} ${item.label}`}>
                        <span className="row-copy">
                          <span className="row-title">
                            <strong className={isSnippet ? "snippet-label" : undefined}>{isSnippet ? <SnippetTitle label={item.label} /> : item.label}</strong>
                            {isSelected && isSnippet && item.snippetNumber && <b className="row-snippet-number">{item.snippetNumber}</b>}
                          </span>
                          {!isSelected && isSnippet && <small className="snippet-preview" lang="en">{item.secret}</small>}
                        </span>
                      </button>
                      {!isSnippet && <button type="button" className="native-reference" onClick={() => void copySecretReference(item)} aria-label={copiedReferenceId === item.id ? `已复制引用 ${item.label}` : `复制引用 ${item.label}`} title={copiedReferenceId === item.id ? "引用已复制" : "复制引用，发给其他任务"}><span className="reference-glyph" aria-hidden="true" /><span className="reference-check" aria-hidden="true">✓</span></button>}
                      <button type="button" className="native-copy" onClick={() => void copy(item)} aria-label={copiedId === item.id ? `已复制 ${item.label}` : `复制 ${item.label}`} title={copiedId === item.id ? "已复制" : "复制"}><span className="copy-glyph" aria-hidden="true" /><span className="copy-check" aria-hidden="true">✓</span></button>
                      <button type="button" className="native-pin" onClick={() => togglePinned(item)} aria-label={`${item.pinned ? "取消收藏" : "收藏"} ${item.label}`} aria-pressed={Boolean(item.pinned)} title={item.pinned ? "取消收藏" : "收藏"}><Icon name="star" filled={Boolean(item.pinned)} /></button>
                      {copiedId === item.id && <span className="copy-status" role="status" aria-live="polite">已复制</span>}
                      {copiedReferenceId === item.id && <span className="copy-status" role="status" aria-live="polite">引用已复制</span>}
                    </div>
                    {isSelected && <div className="row-detail">
                      {isSnippet ? <p className="row-content" lang="en"><SnippetContent text={item.secret} /></p> : (
                        <div className={`row-secret ${revealed ? "revealed" : ""}`}>
                          <span className="row-secret-value">{revealed ? item.secret : "••••••••••••••••"}</span>
                          <button type="button" className="ghost-button reveal-button" aria-pressed={revealed} onPointerDown={() => setRevealedId(item.id)} onPointerUp={() => setRevealedId("")} onPointerLeave={() => setRevealedId("")} onPointerCancel={() => setRevealedId("")} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); setRevealedId(item.id); } }} onKeyUp={() => setRevealedId("")} onBlur={() => setRevealedId("")}><Icon name="eye" />按住显示</button>
                        </div>
                      )}
                      <div className="row-actions">
                        <button type="button" className="primary-button" onClick={() => void copy(item)}><Icon name={copiedId === item.id ? "check" : "copy"} />{copiedId === item.id ? "已复制" : "复制"}<kbd>↵</kbd></button>
                        {isSnippet && hasOptionalSnippetPreparation(item) && <button type="button" className="secondary-button" onClick={() => prepareCopy(item)}>填写变量</button>}
                        {!isSnippet && <button type="button" className="secondary-button" onClick={() => void copySecretReference(item)} title="只复制编号，秘密本身不会出现在聊天或日志里"><Icon name={copiedReferenceId === item.id ? "check" : "link"} />{copiedReferenceId === item.id ? "引用已复制" : "复制引用"}</button>}
                        <button type="button" className="ghost-button" onClick={() => openEditor(item)}>编辑</button>
                        <span className="spacer" />
                        <div className="menu-wrap">
                          <button type="button" className="icon-button" aria-label={`更多操作 ${item.label}`} aria-expanded={rowMenuId === item.id} onClick={() => setRowMenuId((value) => value === item.id ? "" : item.id)}><Icon name="more" /></button>
                          {rowMenuId === item.id && <div className="dropdown row-menu" role="menu">
                            {moveTargets.length > 0 && <p className="menu-label">移动到</p>}
                            {moveTargets.map((folder) => <button type="button" role="menuitem" key={folder || "uncategorized"} onClick={() => void moveItemToFolder(item, folder)}><i className="menu-dot" aria-hidden="true" style={{ background: folder ? categoryColors[folder] : UNCATEGORIZED_COLOR }} />{folder || "未分类"}</button>)}
                            {moveTargets.length > 0 && <div className="menu-divider" />}
                            <button type="button" role="menuitem" className="danger" onClick={() => { setRowMenuId(""); setDeleteRequest({ item, permanent: false }); }}>移到回收站</button>
                          </div>}
                        </div>
                      </div>
                      {!isSnippet && <p className="row-hint">复制引用只复制编号，交给本机其他任务读取，秘密本身不会出现在聊天或日志里。</p>}
                    </div>}
                  </article>
                );
              })}
            </div>
            <footer className="status-bar">
              {appVersion && <span className="status-note"><Icon name="shield" />60 秒后清理剪贴板</span>}
              <span className="spacer" />
              <span><kbd>↑↓</kbd>选择</span>
              <span><kbd>↵</kbd>复制</span>
              <span><kbd>⌘E</kbd>编辑</span>
            </footer>
          </section>
        </>}
      </section>
      {modalOpen && <ItemEditor kind={editing?.kind || activeKind} item={editing} folders={activeFolders} defaultFolder={activeFolder.startsWith("folder:") ? activeFolder.slice(7) : ""} onClose={closeEditor} onDelete={editing ? async () => requestTrash(editing) : undefined} onSave={saveItem} onCopy={copyTextWithExpiry} />}
      {deleteRequest && <DeleteConfirmDialog request={deleteRequest} onClose={() => setDeleteRequest(null)} onConfirm={confirmDelete} />}
      {backupMode && <BackupDialog
        mode={backupMode}
        needsPassword={backupMode === "export" || Boolean(pendingImport?.envelope)}
        onClose={() => { setBackupMode(null); if (backupMode === "import") setPendingImport(null); }}
        onExport={exportVault}
        onImport={applyImport}
      />}
      {folderDialogKind && <FolderDialog
        kind={folderDialogKind}
        onClose={closeFolderDialog}
        onCreate={(name) => createFolder(folderDialogKind, name)}
      />}
      {snippetImport && <SnippetImportDialog preview={snippetImport} fileName={snippetImportName} onClose={() => { setSnippetImport(null); setSnippetImportName(""); }} onImport={applySnippetImport} />}
      {copyRequest && <SnippetCopyDialog request={copyRequest} onClose={() => setCopyRequest(null)} onCopy={async (text) => { await finishCopy(copyRequest.item, text); setCopyRequest(null); }} />}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}

function useDialogKeyboard(dialogRef: React.RefObject<HTMLElement | null>, onClose: () => void, disabled = false) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disabled) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled)") || []);
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const wrapIndex = resolveFocusWrapIndex(currentIndex, focusable.length, event.shiftKey);
      if (wrapIndex >= 0) {
        event.preventDefault();
        focusable[wrapIndex].focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dialogRef, disabled, onClose]);
}

function SnippetImportDialog({ preview, fileName, onClose, onImport }: {
  preview: SnippetImportPreview;
  fileName: string;
  onClose: () => void;
  onImport: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogKeyboard(dialogRef, onClose, busy);
  useEffect(() => { closeRef.current?.focus(); }, []);

  async function confirm() {
    setBusy(true);
    try {
      await onImport();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="snippet-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} className="snippet-import-dialog" role="dialog" aria-modal="true" aria-labelledby="snippet-import-title">
        <header className="snippet-dialog-head">
          <div><p>LOCAL SPREADSHEET</p><h2 id="snippet-import-title">导入话术表格</h2><small title={fileName}>{fileName}</small></div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={busy} aria-label="关闭">×</button>
        </header>
        <div className="snippet-import-body">
          <div className="import-metrics" aria-label="导入统计">
            <div><strong>{preview.totalCount}</strong><span>读取</span></div>
            <div className="positive"><strong>{preview.importableCount}</strong><span>可导入</span></div>
            <div><strong>{preview.duplicateCount}</strong><span>重复</span></div>
            <div className={preview.errorCount ? "warning" : ""}><strong>{preview.errorCount}</strong><span>错误</span></div>
          </div>
          <section className="import-section"><h3>将创建或合并的目录</h3><div className="import-folder-list">{preview.folders.map((folder) => <span key={folder}>{folder}</span>)}</div></section>
          <section className="import-section"><h3>内容预览</h3><div className="import-preview-list">{preview.items.slice(0, 5).map((item) => <div key={item.id}><strong>{item.label}</strong><span>{item.folder} · {item.summary}</span></div>)}</div></section>
          {preview.errors.length > 0 && <section className="import-errors"><h3>需要跳过的行</h3>{preview.errors.slice(0, 4).map((error) => <p key={error}>{error}</p>)}{preview.errors.length > 4 && <small>另有 {preview.errors.length - 4} 行</small>}</section>}
          <p className="import-privacy">表格只在本机解析。导入采用合并方式，不会覆盖秘密或现有话术。</p>
        </div>
        <footer className="snippet-dialog-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button type="button" className="primary" onClick={() => void confirm()} disabled={busy || preview.importableCount === 0}>{busy ? "正在加密写入…" : `导入 ${preview.importableCount} 条话术`}</button></footer>
      </section>
    </div>
  );
}

function SnippetCopyDialog({ request, onClose, onCopy }: {
  request: SnippetCopyRequest;
  onClose: () => void;
  onCopy: (text: string) => Promise<void>;
}) {
  const meta = request.item.snippetMeta!;
  const [language, setLanguage] = useState<CopyLanguage>(request.language);
  const [values, setValues] = useState<Record<string, string>>({});
  const [checkedInputs, setCheckedInputs] = useState<string[]>([]);
  const [verificationConfirmed, setVerificationConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  useDialogKeyboard(dialogRef, onClose, busy);
  useEffect(() => { firstRef.current?.focus(); }, []);
  const source = language === "zh" ? meta.chineseText : request.item.secret;
  const filled = fillSnippetTemplate(source, values);
  const readiness = snippetCopyReadiness(request.item, values, checkedInputs, verificationConfirmed);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!readiness.ready || !source) return;
    setBusy(true);
    try {
      await onCopy(filled.text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="snippet-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} className="snippet-copy-dialog" role="dialog" aria-modal="true" aria-labelledby="snippet-copy-title">
        <header className="snippet-dialog-head"><div><p>CHECK BEFORE COPY</p><h2 id="snippet-copy-title">{request.item.label}</h2><small>{meta.stage} · {meta.action}</small></div><button type="button" onClick={onClose} disabled={busy} aria-label="关闭">×</button></header>
        <form onSubmit={submit}>
          {meta.chineseText && <div className="copy-language" role="group" aria-label="复制语言"><button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>英文</button><button type="button" className={language === "zh" ? "active" : ""} onClick={() => setLanguage("zh")}>中文</button></div>}
          {meta.placeholders.length > 0 && <fieldset className="copy-fields"><legend>填写正文变量</legend>{meta.placeholders.map((placeholder, index) => <label key={placeholder}><span>{placeholder}</span><input ref={index === 0 ? firstRef : undefined} value={values[placeholder] || ""} onChange={(event) => setValues((current) => ({ ...current, [placeholder]: event.target.value }))} placeholder={`输入 ${placeholder}`} /></label>)}</fieldset>}
          {meta.requiredInputs.length > 0 && <fieldset className="copy-checks"><legend>发送前确认</legend>{meta.requiredInputs.map((input) => <label key={input}><input type="checkbox" checked={checkedInputs.includes(input)} onChange={(event) => setCheckedInputs((current) => event.target.checked ? [...current, input] : current.filter((value) => value !== input))} /><span>已确认 {input}</span></label>)}</fieldset>}
          {meta.requiresVerification && <label className="copy-warning"><input type="checkbox" checked={verificationConfirmed} onChange={(event) => setVerificationConfirmed(event.target.checked)} /><span><strong>发送前核实</strong> 金额、库存、地址或时效已按当前情况检查</span></label>}
          <section className="copy-preview"><h3>{language === "en" ? "英文预览" : "中文预览"}</h3><p>{filled.text}</p></section>
          <footer className="snippet-dialog-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button type="submit" className="primary" disabled={busy || !readiness.ready || !source}>{busy ? "正在复制…" : `复制${language === "en" ? "英文" : "中文"}`}</button></footer>
        </form>
      </section>
    </div>
  );
}

function FolderDialog({ kind, onClose, onCreate }: {
  kind: ItemKind;
  onClose: () => void;
  onCreate: (name: string) => Promise<{ created: boolean; folder: string; error?: string }>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("input, button:not(:disabled)") || []);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [busy, onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = name.trim();
    if (!normalized) {
      setError("请输入目录名称");
      return;
    }
    setBusy(true);
    setError("");
    const result = await onCreate(normalized);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <div className="folder-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} className="folder-create-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-create-title">
        <header>
          <h2 id="folder-create-title">新建{kind === "secret" ? "秘密" : "话术"}目录</h2>
          <p>目录会和内容一起加密保存在本机</p>
        </header>
        <form onSubmit={submit}>
          <label className="native-field">
            <span>目录名称 <small>最多 30 字</small></span>
            <div className="soft-input">
              <input
                ref={inputRef}
                value={name}
                onChange={(event) => { setName(normalizeFolderName(event.target.value)); setError(""); }}
                placeholder="例如 客户跟进"
                aria-describedby={error ? "folder-create-error" : undefined}
              />
            </div>
          </label>
          {error && <small id="folder-create-error" className="folder-create-error" role="status">{error}</small>}
          <div className="folder-create-actions">
            <button type="button" onClick={onClose} disabled={busy}>取消</button>
            <button type="submit" className="primary" disabled={busy}>{busy ? "创建中…" : "创建"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function BackupDialog({ mode, needsPassword, onClose, onExport, onImport }: {
  mode: BackupMode;
  needsPassword: boolean;
  onClose: () => void;
  onExport: (password: string) => Promise<void>;
  onImport: (password: string, strategy: ImportStrategy) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [strategy, setStrategy] = useState<ImportStrategy>("merge");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (needsPassword && !password) return setError("请输入备份密码");
    if (mode === "export" && password.length < 8) return setError("备份密码至少需要 8 个字符");
    if (mode === "export" && password !== confirmation) return setError("两次输入的密码不一致");
    setBusy(true);
    try {
      if (mode === "export") await onExport(password);
      else await onImport(password, strategy);
    } catch {
      setError(mode === "import" ? "备份密码不正确，或文件已经损坏" : "导出失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="backup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-title">
        <header className="backup-head">
          <div><p>{mode === "export" ? "SNIPPET EXPORT" : "SAFE IMPORT"}</p><h2 id="backup-title">{mode === "export" ? "导出话术备份" : "导入备份"}</h2></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="关闭">×</button>
        </header>
        <form className="backup-form" onSubmit={submit}>
          <p className="backup-intro">{mode === "export" ? "只备份话术，并使用独立密码加密；秘密不会包含在文件中。" : needsPassword ? "先验证备份密码，验证成功后才会写入本机数据。" : "已识别旧版备份。导入前仍可选择合并或覆盖。"}</p>
          {needsPassword && <label className="backup-field"><span>备份密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "export" ? "至少 8 个字符" : "输入导出时设置的密码"} autoComplete="off" /></label>}
          {mode === "export" && <label className="backup-field"><span>再次输入</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="确认备份密码" autoComplete="off" /></label>}
          {mode === "import" && <fieldset className="backup-strategy"><legend>导入方式</legend><div><button type="button" className={strategy === "merge" ? "active" : ""} onClick={() => setStrategy("merge")}><strong>合并</strong><small>保留现有内容并去重</small></button><button type="button" className={strategy === "replace" ? "active danger" : ""} onClick={() => setStrategy("replace")}><strong>覆盖</strong><small>用备份替换当前内容</small></button></div></fieldset>}
          {error && <p className="backup-error">{error}</p>}
          <p className="backup-note">{mode === "export" ? "请妥善保存密码；Clipbox 无法找回备份密码。" : strategy === "merge" ? "同类型、同标题且内容相同的条目不会重复导入。" : "覆盖会清空当前条目，仅保留备份中的内容。"}</p>
          <div className="backup-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button className={mode === "import" && strategy === "replace" ? "danger" : "primary"} disabled={busy}>{busy ? (mode === "export" ? "正在加密…" : "正在验证…") : mode === "export" ? "加密并导出" : strategy === "merge" ? "验证并合并" : "验证并覆盖"}</button></div>
        </form>
      </section>
    </div>
  );
}

function DeleteConfirmDialog({ request, onClose, onConfirm }: {
  request: DeleteRequest;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { cancelRef.current?.focus(); }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") || []);
      const wrapIndex = resolveFocusWrapIndex(focusable.indexOf(document.activeElement as HTMLElement), focusable.length, event.shiftKey);
      if (wrapIndex >= 0) {
        event.preventDefault();
        focusable[wrapIndex].focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [busy, onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch {
      setError(request.permanent ? "永久删除失败，内容仍保留在回收站" : "删除失败，内容没有移动");
      setBusy(false);
    }
  }

  return (
    <div className="delete-confirm-backdrop">
      <section ref={dialogRef} className={`delete-confirm-dialog ${request.permanent ? "permanent" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-description">
        <header><span>{request.permanent ? "PERMANENT DELETE" : "MOVE TO TRASH"}</span><h2 id="delete-confirm-title">{request.permanent ? "永久删除这条内容？" : "移入回收站？"}</h2><p id="delete-confirm-description">{request.permanent ? "删除后无法恢复，请确认你不再需要它。" : "内容将从普通目录隐藏，之后可以在回收站恢复。"}</p></header>
        <form onSubmit={(event) => void submit(event)}>
          <div className="delete-confirm-item"><strong>{request.item.label}</strong><small>{request.item.folder || "未分类"}</small></div>
          {error && <p className="delete-confirm-error" role="alert">{error}</p>}
          <div className="delete-confirm-actions"><button ref={cancelRef} type="button" onClick={onClose} disabled={busy}>取消</button><button className={request.permanent ? "danger" : "primary"} disabled={busy}>{busy ? "正在处理…" : request.permanent ? "永久删除" : "移入回收站"}</button></div>
        </form>
      </section>
    </div>
  );
}

function ItemEditor({ kind, item, folders, defaultFolder, onClose, onDelete, onSave, onCopy }: { kind: ItemKind; item: SecretItem | null; folders: string[]; defaultFolder: string; onClose: () => void; onDelete?: () => Promise<void>; onSave: (data: Omit<SecretItem, "id" | "createdAt" | "updatedAt">) => Promise<void>; onCopy: (text: string) => Promise<void> }) {
  const structured = Boolean(item?.snippetMeta);
  const [label, setLabel] = useState(item?.label || "");
  const [secret, setSecret] = useState(item?.secret || "");
  const [secretParts, setSecretParts] = useState<[string, string]>(() => item?.secretSegments || splitSecretSegments(item?.secret || ""));
  const [segmentedSecret, setSegmentedSecret] = useState(kind === "secret" && Boolean(item?.secretSegments));
  const [summary, setSummary] = useState(item?.summary || "");
  const [chineseText, setChineseText] = useState(item?.snippetMeta?.chineseText || "");
  const [rawProduct, setRawProduct] = useState(item?.snippetMeta?.rawProduct || "");
  const [usageNote, setUsageNote] = useState(item?.snippetMeta?.usageNote || "");
  const [referenceNote, setReferenceNote] = useState(kind === "secret" ? item?.note || "" : "");
  const [summaryError, setSummaryError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [referenceStatus, setReferenceStatus] = useState<"idle" | "copied" | "error">("idle");
  const [folder, setFolder] = useState(resolveSelectedFolder(folders, item?.folder || defaultFolder || (kind === "snippet" ? STANDARD_SNIPPET_FOLDERS[0] : ""), kind === "secret"));
  const [color] = useState(item?.color || (kind === "snippet" ? "#ffcfa8" : COLORS[0]));
  const [busy, setBusy] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [visible, setVisible] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const copyOnSubmitRef = useRef(false);
  const latestContentRef = useRef(secret);
  const latestSummaryRef = useRef(summary);

  useEffect(() => {
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        copyOnSubmitRef.current = event.shiftKey;
        formRef.current?.requestSubmit();
      }
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)") || []);
        const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
        const wrapIndex = resolveFocusWrapIndex(currentIndex, focusable.length, event.shiftKey);
        if (wrapIndex >= 0) {
          event.preventDefault();
          focusable[wrapIndex].focus();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [busy, onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !label.trim() || !secret) return;
    setBusy(true);
    setSaveError("");
    const shouldCopy = copyOnSubmitRef.current;
    copyOnSubmitRef.current = false;
    const selectedFolder = resolveSelectedFolder(folders, folder, kind === "secret");
    const nextSummary = kind === "snippet" ? (structured ? summary.trim() : limitChars(summary)) : "";
    const snippetMeta = structured && item?.snippetMeta ? {
      ...item.snippetMeta,
      stage: selectedFolder,
      scene: label.trim(),
      action: nextSummary,
      productGroups: productGroupsForRawProduct(rawProduct),
      rawProduct: rawProduct.trim(),
      chineseText,
      placeholders: extractPlaceholders(`${secret}\n${chineseText}`),
      usageNote: usageNote.trim(),
    } : undefined;
    const result = await attemptEditorSave(() => onSave({
      label: label.trim(),
      secret,
      secretSegments: kind === "secret" && segmentedSecret ? secretParts : undefined,
      note: kind === "secret" ? normalizeReferenceNote(referenceNote) : item?.note || "",
      color,
      kind,
      folder: selectedFolder,
      summary: nextSummary,
      snippetMeta,
    }));
    if (!result.saved) {
      setSaveError(result.error);
      setBusy(false);
      return;
    }
    if (shouldCopy && !structured) {
      await onCopy(secret);
      window.clipboxDesktop?.didCopy();
    }
  }

  function toggleSecretSegments() {
    if (kind !== "secret") return;
    if (segmentedSecret) {
      setSecret(combineSecretSegments(secretParts));
      setSegmentedSecret(false);
      return;
    }
    const nextParts = splitSecretSegments(secret);
    setSecretParts(nextParts);
    setSecret(combineSecretSegments(nextParts));
    setSegmentedSecret(true);
  }

  function updateSecretPart(index: 0 | 1, value: string) {
    const nextParts: [string, string] = index === 0 ? [value, secretParts[1]] : [secretParts[0], value];
    setSecretParts(nextParts);
    setSecret(combineSecretSegments(nextParts));
  }

  async function copyEditorReference() {
    if (kind !== "secret" || !item) return;
    try {
      await copyTextWithExpiry(formatSecretReference(item.id));
      setReferenceStatus("copied");
      window.clipboxDesktop?.didCopy();
      window.setTimeout(() => setReferenceStatus("idle"), 1600);
    } catch {
      setReferenceStatus("error");
    }
  }

  async function summarize() {
    const captured = latestContentRef.current.trim();
    const capturedSummary = latestSummaryRef.current;
    if (!captured) return;
    setSummarizing(true);
    setSummaryError("");
    try {
      const generated = await aiSummary(captured);
      const result = resolveGeneratedSummary(
        captured,
        latestContentRef.current.trim(),
        capturedSummary,
        latestSummaryRef.current,
        generated,
      );
      if (!result.stale) {
        latestSummaryRef.current = result.summary;
        setSummary(result.summary);
        setSummaryError(result.error);
      }
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} className="editor-dialog" role="dialog" aria-modal="true" aria-labelledby="item-title">
        <header className="editor-head">
          <div>
            <div className={`editor-kind ${kind}`}>
              <span>{kind === "secret" ? "秘密" : "话术"}</span>
              {kind === "snippet" && item?.snippetNumber && <b className="editor-snippet-number">{item.snippetNumber}</b>}
              {kind === "secret" && <button type="button" className={`editor-reference ${referenceStatus}`} onClick={() => void copyEditorReference()} disabled={!item || busy} aria-live="polite">{referenceStatus === "copied" ? "已复制" : referenceStatus === "error" ? "复制失败" : item ? "复制引用" : "保存后可复制"}</button>}
            </div>
            <h2 id="item-title">{item ? "编辑内容" : kind === "secret" ? "添加秘密" : "添加话术"}</h2>
            <p>{kind === "secret" ? "加密保存在这台设备上" : structured ? "中英文和使用规则一起加密保存在本机" : "总结可手动填写，也可用本机 AI 生成"}</p>
          </div>
          <button className="editor-close" type="button" onClick={onClose} disabled={busy} aria-label="关闭">×</button>
        </header>
        <form ref={formRef} onSubmit={submit}>
          <div className="editor-body">
            <div className="editor-meta-grid">
              <label className="native-field"><span>{structured ? "具体场景" : "标题"}</span><div className="soft-input"><input ref={titleInputRef} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === "secret" ? "例如 prod-ssh" : "例如 售后夸赞"} maxLength={60} /></div></label>
              <label className="native-field folder-field">
                <span>目录 <small>{kind === "secret" ? "可选择或手写" : "必选"}</small></span>
                <div className="folder-select">
                  {kind === "secret" ? <>
                    <input
                      list="secret-folder-options"
                      value={folder}
                      onChange={(event) => setFolder(event.target.value)}
                      placeholder="未分类"
                      maxLength={30}
                      autoComplete="off"
                    />
                    <datalist id="secret-folder-options">
                      {folders.map((value) => <option key={value} value={value} />)}
                    </datalist>
                  </> : <select value={folder} onChange={(event) => setFolder(event.target.value)} required>
                    {folders.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>}
                </div>
              </label>
            </div>

            {kind === "secret" && <label className="native-field reference-note-field"><span>被什么引用 <small>可选</small></span><div className="soft-input"><input value={referenceNote} onChange={(event) => setReferenceNote(event.target.value)} placeholder="例如 Shopify API、订单同步任务" maxLength={120} /></div></label>}

            {kind === "secret" && <div className="segmented" role="group" aria-label="内容显示方式">
              <button type="button" className={!visible ? "active" : ""} aria-pressed={!visible} onClick={() => setVisible(false)}>隐藏内容</button>
              <button type="button" className={visible ? "active" : ""} aria-pressed={visible} onClick={() => setVisible(true)}>明文显示</button>
            </div>}

            <div className={`native-field content-field ${kind === "snippet" ? "snippet-content" : ""}`}><span className="content-field-head"><span>{kind === "secret" ? "密码 / 文本" : "话术内容"}</span>{kind === "secret" && <button type="button" className={segmentedSecret ? "segment-toggle active" : "segment-toggle"} aria-pressed={segmentedSecret} onClick={toggleSecretSegments}>{segmentedSecret ? "合并" : "分段"}</button>}</span><div className={`soft-textarea ${segmentedSecret ? "secret-segmented" : ""}`}>{segmentedSecret ? <><textarea aria-label="秘密第一段" className={!visible ? "masked" : ""} value={secretParts[0]} onChange={(event) => updateSecretPart(0, event.target.value)} placeholder="第一段" rows={2} /><textarea aria-label="秘密第二段" className={!visible ? "masked" : ""} value={secretParts[1]} onChange={(event) => updateSecretPart(1, event.target.value)} placeholder="第二段" rows={2} /></> : <textarea aria-label={kind === "secret" ? "密码 / 文本" : "话术内容"} className={kind === "secret" && !visible ? "masked" : ""} value={secret} onChange={(event) => { latestContentRef.current = event.target.value; setSecret(event.target.value); setSummaryError(""); }} placeholder={kind === "secret" ? "输入要保存的密码或文本" : "输入需要反复使用的话术"} rows={6} />}</div></div>

            {kind === "snippet" && <div className="native-field summary-field">
              <label htmlFor="summary-input">{structured ? "核心动作" : "总结"} {!structured && <small>最多 10 字</small>}</label>
              <div className="summary-control">
                <input id="summary-input" value={summary} onChange={(event) => { const value = structured ? event.target.value : limitChars(event.target.value); latestSummaryRef.current = value; setSummary(value); setSummaryError(""); }} placeholder={structured ? "例如 发送睫毛报价" : "例如 售后夸赞"} />
                {!structured && <button type="button" onClick={() => void summarize()} disabled={summarizing || !secret.trim()}>{summarizing ? "总结中…" : "AI 总结"}</button>}
              </div>
              {summaryError && <small className="summary-error" role="status">{summaryError}</small>}
            </div>}
            {structured && <details className="structured-details">
              <summary>中文对照与使用规则</summary>
              <div className="structured-fields">
                <label className="native-field"><span>中文对照</span><div className="soft-textarea compact"><textarea value={chineseText} onChange={(event) => setChineseText(event.target.value)} rows={4} /></div></label>
                <label className="native-field"><span>产品 / 业务</span><div className="soft-input"><input value={rawProduct} onChange={(event) => setRawProduct(event.target.value)} /></div></label>
                <label className="native-field"><span>使用备注</span><div className="soft-textarea compact note"><textarea value={usageNote} onChange={(event) => setUsageNote(event.target.value)} rows={3} /></div></label>
              </div>
            </details>}
          </div>
          {saveError && <p className="editor-save-error" role="alert">{saveError}</p>}
          <footer className={`editor-footer ${onDelete ? "has-delete" : ""}`}>
            <div>{onDelete && <button type="button" className="delete-entry" onClick={() => void onDelete()}>删除</button>}</div>
            <div className="editor-actions"><button type="button" className="editor-cancel" onClick={onClose} disabled={busy}>取消</button><button className={`editor-save ${structured ? "" : "secondary"}`} disabled={busy || !label.trim() || !secret}>{busy ? "正在保存…" : "保存"}</button>{!structured && <button className="editor-save" onClick={() => { copyOnSubmitRef.current = true; }} disabled={busy || !label.trim() || !secret}>{busy ? "正在保存…" : "保存并复制"}</button>}</div>
          </footer>
        </form>
      </section>
    </div>
  );
}
