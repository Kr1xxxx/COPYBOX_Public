"use client";

import { ArcToast } from "./arc/arc-toast";
import { copyTextWithExpiry } from "./clipboard";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildCategoryColorMap, CATEGORY_PALETTE, UNCATEGORIZED_COLOR } from "./category-colors";
import {
  canReorderCards,
  moveName,
  reorderNames,
  reorderVisibleItems,
} from "./clipbox-order";
import {
  addFolder,
  buildDirectoryShortcuts,
  canAddItemInFolder,
  DEFAULT_ITEM_KIND,
  EMPTY_FOLDER_REGISTRY,
  itemMatchesActiveFolder,
  mergeImportedVaultData,
  modalInteractionState,
  normalizeFolderName,
  normalizeVaultData,
  isTrashedItem,
  permanentlyDeleteTrashedItem,
  parseRefreshContext,
  resolvePostCommitFocusTarget,
  resolveRefreshedActiveFolder,
  restoreTrashedItem,
  selectItemsByTrashState,
  type FolderRegistry,
  type FolderColors,
  deleteFolder,
  folderEditBlocker,
  moveItemsToFolder,
  moveItemsToTrash,
  renameFolder,
  restoreTrashedItems,
  setFolderColor,
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
  resolveSnippetCopySource,
  snippetCopyReadiness,
  type SnippetImportPreview,
} from "./snippet-import";
import { FolderRow } from "./folder-row";
import { ListEmptyState } from "./list-empty-state";
import { PLAIN_NOTES, SECRET_WORD } from "./platform";
import { Highlight, Icon, SnippetContent, SnippetTitle, VaultMark } from "./ui-atoms";
import "./desktop-bridge";
import type { WindowMode } from "./desktop-bridge";
import { DEFAULT_TRASH_DAYS, TRASH_DAY_OPTIONS, type CloseBehavior, type MiniHidePolicy, type ThemeChoice } from "./preferences";
import { ItemEditor } from "./item-editor";
import { ImageFolderNav, ImageFolderSelect } from "./image-folders";
import { countImagesByFolder, imageFilterTitle, imageFolderColors } from "./image-folders-core";
import { IMAGE_FOLDER_NAME_MAX } from "./image-store";
import { useImageLibrary } from "./image-library";
import { ImageSection, type ImageCounts, type ImageSectionHandle } from "./image-section";
import { ArcSegmented } from "./arc/segmented";
import { ArcMenu } from "./arc/menu";
import { AnimatePresence } from "motion/react";
import { ImageViewSwitch, useImageView } from "./image-view";
import { SettingsDialog } from "./settings";
import type { SettingsFolderGroup, SettingsFolderKind } from "./settings-folders";
import { BackupDialog, DeleteConfirmDialog, SnippetImportDialog, type BackupMode, type DeleteRequest } from "./dialogs";
import { SnippetFill, emptyFillState, latestValues, rememberValues, type ValueMemory, type CopyLanguage, type SnippetFillState } from "./fill-panel";
import { searchSnippets, searchSnippetsEnglish } from "./snippet-search";
import { UpdateNotice } from "./update-notice";
import { usePointerReorder } from "./use-pointer-reorder";
import { useSortFlipAnimation } from "./use-sort-flip-animation";
import { AutomationCommandError, commitSnippetAutomationCommand, formatSecretReference, isAutomationReadAction, parseSecretExportCommand } from "./clipbox-automation";

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
const DETAIL_CLOSE_MS = 220;
const CLOSE_BEHAVIOR_KEY = "clipbox.close-behavior";
const THEME_KEY = "clipbox.theme";
const LAST_BACKUP_KEY = "clipbox.last-backup-at";
const THEME_OPTIONS = ["system", "light", "dark"] as const;
const MINI_HIDE_KEY = "clipbox.mini-hide-policy";
const TRASH_DAYS_KEY = "clipbox.trash-retention-days";

function readStoredChoice<T extends string | number>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    const match = allowed.find((value) => String(value) === raw);
    if (match !== undefined) return match;
  } catch {
    // Storage can be unavailable; use the default.
  }
  return fallback;
}

function writeStoredChoice(key: string, value: string | number) {
  try { localStorage.setItem(key, String(value)); } catch { /* keep the in-memory choice for this session */ }
}

const STORAGE_KEY = "clipbox.vault.v1";
const DEVICE_KEY = "clipbox.device-key.v1";
const REFRESH_CONTEXT_KEY = "clipbox:refresh-context";
const ITERATIONS = 310_000;

// parseRefreshContext only knows the text sections; the 图片 flag rides along in the same stored object.
function readRefreshedImageView(stored: string | null) {
  try { return JSON.parse(stored || "null")?.imageView === true; } catch { return false; }
}

function timestampNow() {
  return Date.now();
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

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
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

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [deviceKey, setDeviceKey] = useState("");
  const [items, setItems] = useState<SecretItem[]>([]);
  const [folders, setFolders] = useState<FolderRegistry>(EMPTY_FOLDER_REGISTRY);
  const [folderColors, setFolderColors] = useState<FolderColors | undefined>(undefined);
  const [activeKind, setActiveKind] = useState<ItemKind>(DEFAULT_ITEM_KIND);
  // The 图片 section is not an ItemKind: its data lives in its own store, never in the vault.
  const [imageView, setImageView] = useState(false);
  const [imageCounts, setImageCounts] = useState<ImageCounts>({ total: 0, shown: 0 });
  const imageSectionRef = useRef<ImageSectionHandle>(null);
  const [imageViewMode, setImageViewMode] = useImageView();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Images and folders are shared by the sidebar, the list and Settings → 目录; nothing is read until one of them opens.
  const imageLibrary = useImageLibrary(deviceKey, imageView || settingsOpen, flashToast);
  const [activeFolder, setActiveFolder] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  // Cards that just lost the selection keep their detail mounted while it folds away.
  const [closingIds, setClosingIds] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SecretItem | null>(null);
  const [toast, setToast] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [copiedReferenceId, setCopiedReferenceId] = useState("");
  const [, setMenuOpen] = useState(false);
  const [newFolder, setNewFolder] = useState<{ name: string; error: string } | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<{ from: string; value: string; error: string } | null>(null);
  const [folderMenu, setFolderMenu] = useState("");
  const [folderMenuPos, setFolderMenuPos] = useState({ top: 0, left: 0 });
  const [folderDeleteArm, setFolderDeleteArm] = useState("");
  const [searchAllFolders, setSearchAllFolders] = useState(false);
  const [englishSearch, setEnglishSearch] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(() => readStoredChoice<ThemeChoice>(THEME_KEY, THEME_OPTIONS, "system"));
  const [lastBackupAt, setLastBackupAt] = useState(() => {
    try { return Number(localStorage.getItem(LAST_BACKUP_KEY)) || 0; } catch { return 0; }
  });
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [backupMode, setBackupMode] = useState<BackupMode | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [snippetImport, setSnippetImport] = useState<SnippetImportPreview | null>(null);
  const [snippetImportName, setSnippetImportName] = useState("");
  const [fill, setFill] = useState<SnippetFillState | null>(null);
  const [typingVariable, setTypingVariable] = useState(false);
  // Kept in memory only: customer names must not sit in plain browser storage.
  const [valueMemory, setValueMemory] = useState<ValueMemory>({});
  const lastValues = latestValues(valueMemory);
  const [activeVar, setActiveVar] = useState<{ id: string; name: string } | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [undoTrash, setUndoTrash] = useState<SecretItem[] | null>(null);
  const undoTimerRef = useRef<number | null>(null);
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
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const pendingEditorFocusRef = useRef<{ trigger: HTMLElement | null } | null>(null);
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const referenceFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef<SecretItem[]>([]);
  const foldersRef = useRef<FolderRegistry>(EMPTY_FOLDER_REGISTRY);
  const folderColorsRef = useRef<FolderColors | undefined>(undefined);
  const nextSnippetNumberRef = useRef(1);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const { prepareSortAnimation } = useSortFlipAnimation();

  useEffect(() => {
    let cancelled = false;
    const storedContext = localStorage.getItem(REFRESH_CONTEXT_KEY);
    const refreshContext = parseRefreshContext(storedContext);
    const refreshedImageView = refreshContext ? readRefreshedImageView(storedContext) : false;
    localStorage.removeItem(REFRESH_CONTEXT_KEY);

    function finishOpening(data: VaultData, nextDeviceKey: string) {
      if (cancelled) return;
      setDeviceKey(nextDeviceKey);
      itemsRef.current = data.items;
      foldersRef.current = data.folders;
      folderColorsRef.current = data.folderColors;
      nextSnippetNumberRef.current = data.nextSnippetNumber;
      setItems(data.items);
      setFolders(data.folders);
      setFolderColors(data.folderColors);
      if (refreshContext) {
        // Windows has no second text section any more: an old context that points at it opens 话术.
        const restoredKind: ItemKind = PLAIN_NOTES && refreshContext.activeKind === "secret" ? "snippet" : refreshContext.activeKind;
        setActiveKind(restoredKind);
        setActiveFolder(resolveRefreshedActiveFolder(restoredKind, data.folders[restoredKind], restoredKind === refreshContext.activeKind ? refreshContext.activeFolder : "all"));
        setProductFilter(refreshContext.productFilter);
        setQuery(refreshContext.query);
        setImageView(refreshedImageView);
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
  const categoryColors = useMemo(() => ({ ...buildCategoryColorMap(activeFolders), ...(folderColors?.[activeKind] || {}) }), [activeFolders, folderColors, activeKind]);
  const activeKindItems = useMemo(() => selectItemsByTrashState(items, activeKind, "active"), [items, activeKind]);
  const trashedKindItems = useMemo(() => selectItemsByTrashState(items, activeKind, "trash"), [items, activeKind]);
  const directoryShortcuts = useMemo(() => buildDirectoryShortcuts(items, activeKind), [items, activeKind]);

  const searching = query.trim().length > 0;
  const searchWholeVault = searching && (searchAllFolders || activeFolder === "all");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const trashView = activeFolder === "trash";
    const kindItems = selectItemsByTrashState(items, activeKind, trashView ? "trash" : "active");
    const scopeFolder = !trashView && normalized && searchAllFolders ? "all" : activeFolder;
    const scoped = kindItems.filter((item) => itemMatchesActiveFolder(item, scopeFolder));
    const productMatched = activeKind === "snippet" && !trashView
      ? scoped.filter((item) => matchesSnippetProduct(item, productFilter))
      : scoped;
    const isSnippetSearch = Boolean(normalized) && activeKind === "snippet";
    const matched = isSnippetSearch ? (englishSearch ? searchSnippetsEnglish(productMatched, normalized) : searchSnippets(productMatched, normalized)) : normalized ? productMatched.filter((item) => {
      const haystack = `${item.label} ${item.note} ${item.summary || ""}`.toLowerCase();
      return normalized.split(/\s+/).every((term) => haystack.includes(term));
    }) : productMatched;
    if (scopeFolder === "recent") return matched.toSorted((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0)).slice(0, 50);
    return isSnippetSearch ? matched : matched.toSorted((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  }, [items, query, activeKind, activeFolder, productFilter, searchAllFolders, englishSearch]);

  const safeSelected = Math.min(selected, Math.max(0, filtered.length - 1));
  const selectedCardId = filtered[safeSelected]?.id || "";
  const closingAnimationsRef = useRef(new Map<string, Animation[]>());

  // A card that just lost the selection folds its card chrome and title row back
  // to the plain list look while its detail collapses (see .row-detail.closing).
  useLayoutEffect(() => {
    const running = closingAnimationsRef.current;
    for (const [id, animations] of running) {
      if (closingIds.includes(id) && id !== selectedCardId) continue;
      for (const animation of animations) animation.cancel();
      running.delete(id);
    }
    for (const id of closingIds) {
      if (id === selectedCardId || running.has(id)) continue;
      const row = document.querySelector<HTMLElement>(`[data-sort-scope="card"][data-sort-id="${CSS.escape(id)}"]`);
      const line = row?.querySelector<HTMLElement>(".row-line");
      if (!row || !line || typeof row.animate !== "function") continue;
      const timing: KeyframeAnimationOptions = { duration: DETAIL_CLOSE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" };
      const plainHeight = row.classList.contains("secret-row") ? "44px" : "52px";
      const card = getComputedStyle(row);
      const animations = [
        row.animate([
          { margin: card.margin, borderWidth: card.borderTopWidth, borderColor: card.borderTopColor, backgroundColor: card.backgroundColor, boxShadow: card.boxShadow },
          { margin: "0px", borderWidth: "0px", borderColor: "rgba(0, 0, 0, 0)", backgroundColor: "rgba(0, 0, 0, 0)", boxShadow: "0 0 0 rgba(0, 0, 0, 0)" },
        ], timing),
        line.animate([{ height: `${line.getBoundingClientRect().height}px` }, { height: plainHeight }], timing),
      ];
      running.set(id, animations);
      void animations[0].finished.then(() => {
        setClosingIds((ids) => ids.filter((value) => value !== id));
      }).catch(() => undefined);
    }
  }, [closingIds, selectedCardId]);
  const auxiliaryDialogOpen = Boolean(snippetImport || deleteRequest || settingsOpen);
  const inlineEditing = modalOpen || typingVariable || Boolean(newFolder) || Boolean(renamingFolder);
  const { homeShortcutsEnabled } = modalInteractionState(inlineEditing || auxiliaryDialogOpen, false, Boolean(backupMode));
  const backgroundInert = auxiliaryDialogOpen || Boolean(backupMode);
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
  }, [activeFolder, activeKind, backupMode, cancelCardDrag, cancelFolderDrag, typingVariable, deleteRequest, newFolder, modalOpen, productFilter, query, snippetImport]);

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
          imageView,
        }));
        setToast("正在重新加载…");
        window.clipboxDesktop.relaunch();
        relaunching = true;
        return;
      }
      setDeviceKey(opened.deviceKey);
      itemsRef.current = opened.data.items;
      foldersRef.current = opened.data.folders;
      folderColorsRef.current = opened.data.folderColors;
      nextSnippetNumberRef.current = opened.data.nextSnippetNumber;
      setItems(opened.data.items);
      setFolders(opened.data.folders);
      setFolderColors(opened.data.folderColors);
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

  // A newer message replaces the older one and its timer, so it is never cut short.
  function flashToast(message: string, ms = 2200) {
    if (flashToastTimer.current) clearTimeout(flashToastTimer.current);
    setToast(message);
    flashToastTimer.current = setTimeout(() => setToast(""), ms);
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

  // The 全部产品 filter, a row's ⋯ menu, the bulk 移动到 menu and the folder menu close on a click or touch anywhere outside them, and on Esc.
  const dropdownOpen = productMenuOpen || Boolean(rowMenuId) || bulkMoveOpen || Boolean(folderMenu);
  useEffect(() => {
    if (!dropdownOpen) return;
    const closeAll = () => { setProductMenuOpen(false); setRowMenuId(""); setBulkMoveOpen(false); setFolderMenu(""); setFolderDeleteArm(""); };
    const outside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".folder-menu, .folder-more")) return; // the folder menu has its own scrim and toggle
      if (target?.closest(".product-filter-wrap")) { setRowMenuId(""); setBulkMoveOpen(false); return; }
      if (target?.closest(".menu-wrap")) { setProductMenuOpen(false); return; }
      closeAll();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") closeAll(); };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape); };
  }, [dropdownOpen]);

  useEffect(() => {
    if (loading) return;
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === "Escape" && newFolder && !auxiliaryDialogOpen) { event.preventDefault(); cancelNewFolder(); return; }
      if (!homeShortcutsEnabled) return;
      if (event.key === "Escape" && !inlineEditing && !auxiliaryDialogOpen) {
        if (bulkMode) { setBulkMode(false); setBulkIds([]); setBulkMoveOpen(false); return; }
        setQuery("");
        setMenuOpen(false);
        setProductMenuOpen(false);
        setRowMenuId("");
        searchRef.current?.blur();
      }
    };
    const removeDesktopListener = window.clipboxDesktop?.onFocusSearch(() => {
      if (!homeShortcutsEnabled) return;
      setActiveFolder("all");
      setQuery("");
      window.setTimeout(() => searchRef.current?.focus(), 30);
    });
    window.addEventListener("keydown", shortcut);
    return () => {
      window.removeEventListener("keydown", shortcut);
      removeDesktopListener?.();
    };
  }, [loading, inlineEditing, newFolder, auxiliaryDialogOpen, backupMode, bulkMode, homeShortcutsEnabled, filtered, safeSelected, activeFolder, windowMode]);

  const readVault = useCallback((): VaultData => ({
    items: itemsRef.current,
    folders: foldersRef.current,
    nextSnippetNumber: nextSnippetNumberRef.current,
    folderColors: folderColorsRef.current,
  }), []);

  // Both UI changes and external commands compute their update inside this queue.
  const enqueueVaultTask = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const queued = persistQueueRef.current.catch(() => undefined).then(task);
    persistQueueRef.current = queued.then(() => undefined, () => undefined);
    return queued;
  }, []);

  const writeVault = useCallback(async (nextData: VaultData) => {
    const data = synchronizeVaultData(nextData.items, nextData.folders, nextData.nextSnippetNumber, nextData.folderColors);
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as VaultEnvelope | null;
    const envelope = await encryptVault(data, deviceKey, current?.salt);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    itemsRef.current = data.items;
    foldersRef.current = data.folders;
    folderColorsRef.current = data.folderColors;
    nextSnippetNumberRef.current = data.nextSnippetNumber;
    setItems(data.items);
    setFolders(data.folders);
    setFolderColors(data.folderColors);
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
              folderColors: folderColorsRef.current,
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
            setToast(`${SECRET_WORD}加密备份已生成`);
            window.setTimeout(() => setToast(""), 2200);
            return;
          }
          const committed = await commitSnippetAutomationCommand(
            {
              items: itemsRef.current,
              folders: foldersRef.current,
              nextSnippetNumber: nextSnippetNumberRef.current,
              folderColors: folderColorsRef.current,
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
    void persist((current) => ({ ...current, items: current.items.map((value) => value.id === item.id ? { ...value, lastUsedAt: timestampNow(), useCount: (value.useCount || 0) + 1 } : value) })).catch(() => setToast("已复制，但使用记录保存失败"));
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

  function fillFor(item: SecretItem) { return fill?.itemId === item.id ? fill : emptyFillState(item, lastValues); }
  function updateFill(item: SecretItem) {
    return (update: (current: SnippetFillState) => SnippetFillState) => setFill((current) => update(current?.itemId === item.id ? current : emptyFillState(item, lastValues)));
  }

  // A snippet with variables copies what is typed into its highlighted blocks; the first empty block gets the cursor instead of a half-filled copy.
  async function copyPrepared(item: SecretItem, pickedValues?: Record<string, string>, pickedName?: string) {
    const state = pickedValues ? { ...fillFor(item), values: pickedValues } : fillFor(item);
    const source = resolveSnippetCopySource(item, state.language);
    if (!source) return;
    const readiness = snippetCopyReadiness(item, state.values, state.checkedInputs, state.verificationConfirmed, state.language);
    if (!readiness.ready) {
      const index = filtered.findIndex((value) => value.id === item.id);
      if (index >= 0 && index !== safeSelected) selectRow(index);
      const missing = readiness.missingPlaceholders;
      setToast(missing.length > 0 ? `先填写：${missing.join("、")}` : readiness.missingChecks.length > 0 ? "先勾选“发送前确认”" : "先勾选“发送前核实”");
      window.setTimeout(() => setToast(""), 2200);
      window.setTimeout(() => {
        const row = document.querySelector(`[data-sort-id="${CSS.escape(item.id)}"]`);
        if (missing.length > 0) Array.from(row?.querySelectorAll<HTMLInputElement>("input[data-var]") || []).find((input) => !input.value.trim())?.focus();
        else row?.querySelector<HTMLInputElement>(".copy-checks input:not(:checked), .copy-warning input:not(:checked)")?.focus();
      }, 60);
      return;
    }
    // Values carried over from an earlier copy are shown first: the person must see them once before they go out.
    const unseen = state.remembered.filter((name) => name !== pickedName && extractPlaceholders(source).includes(name));
    if (unseen.length > 0) {
      const index = filtered.findIndex((value) => value.id === item.id);
      if (index >= 0 && index !== safeSelected) selectRow(index);
      setFill({ ...state, values: state.values, remembered: [] });
      setToast(`带入了上次的${unseen.map((name) => `${name}（${state.values[name]}）`).join("、")}，确认没错再复制一次`);
      window.setTimeout(() => setToast(""), 3600);
      return;
    }
    await finishCopy(item, fillSnippetTemplate(source, state.values).text);
    setValueMemory((current) => rememberValues(current, state.values));
  }

  // Clicking a remembered value fills the block. If every other block is already filled it copies at once, otherwise the cursor moves on.
  function pickRemembered(item: SecretItem, name: string, value: string) {
    const state = fillFor(item);
    const values = { ...state.values, [name]: value };
    updateFill(item)((current) => ({ ...current, values: { ...current.values, [name]: value }, remembered: current.remembered.filter((entry) => entry !== name) }));
    if (extractPlaceholders(resolveSnippetCopySource(item, state.language)).every((placeholder) => (values[placeholder] || "").trim())) { void copyPrepared(item, values, name); return; }
    window.setTimeout(() => {
      const row = document.querySelector(`[data-sort-id="${CSS.escape(item.id)}"]`);
      Array.from(row?.querySelectorAll<HTMLInputElement>("input[data-var]") || []).find((input) => input.dataset.var !== name && !input.value.trim())?.focus();
    }, 40);
  }

  async function copy(item: SecretItem, language: CopyLanguage = "en") {
    if (item.kind === "snippet" && hasOptionalSnippetPreparation(item)) { await copyPrepared(item); return; }
    await copyRaw(item, language);
  }

  // The mini window has no place to fill variables, so it copies the text as written.
  async function copyRaw(item: SecretItem, language: CopyLanguage = "en") {
    const source = resolveSnippetCopySource(item, language);
    if (!source) return;
    await finishCopy(item, source);
  }

  function handleSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (imageView) {
      if (event.key === "Escape") { setQuery(""); searchRef.current?.blur(); }
      return;
    }
    if (event.key === "ArrowDown") { event.preventDefault(); moveSelection((value) => Math.min(Math.max(0, filtered.length - 1), value + 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); moveSelection((value) => Math.max(0, value - 1)); }
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

  function startNewFolder() {
    setNewFolder({ name: "", error: "" });
    setFolderMenu("");
    setRenamingFolder(null);
  }

  const creatingFolder = Boolean(newFolder);
  useEffect(() => {
    if (creatingFolder) newFolderInputRef.current?.focus();
  }, [creatingFolder]);

  function cancelNewFolder() {
    setNewFolder(null);
    window.setTimeout(() => folderCreateButtonRef.current?.focus(), 0);
  }

  async function submitNewFolder() {
    if (!newFolder) return;
    const result = addFolder(foldersRef.current, activeKind, newFolder.name);
    if (!result.folder) { setNewFolder({ ...newFolder, error: "请输入目录名称" }); return; }
    try {
      if (result.created) await persist((current) => ({ ...current, folders: addFolder(current.folders, activeKind, newFolder.name).folders }));
      setNewFolder(null);
      selectFolder(`folder:${result.folder}`);
      setToast(result.created ? "目录已创建" : "目录已存在，已打开");
      window.setTimeout(() => setToast(""), 2200);
    } catch {
      setNewFolder({ ...newFolder, error: "创建失败，请重试" });
    }
  }

  async function commitFolderChange(update: (data: VaultData) => { data: VaultData; error?: string }, success: string) {
    const failure = await enqueueVaultTask(async () => {
      const result = update(readVault());
      if (result.error) return result.error;
      await writeVault(result.data);
      return "";
    }).catch(() => "保存失败，目录保持原样");
    setToast(failure || success);
    window.setTimeout(() => setToast(""), failure ? 2800 : 2000);
    return failure;
  }

  async function submitFolderRename() {
    if (!renamingFolder) return;
    const { from, value } = renamingFolder;
    const kind = activeKind;
    const trimmed = normalizeFolderName(value);
    if (trimmed === from) { setRenamingFolder(null); return; }
    const error = await commitFolderChange((data) => renameFolder(data, kind, from, value), "目录已重命名");
    if (error) { setRenamingFolder({ from, value, error }); return; }
    if (activeFolder === `folder:${from}`) setActiveFolder(`folder:${trimmed}`);
    setRenamingFolder(null);
  }

  async function removeFolder(folder: string) {
    const kind = activeKind;
    setFolderMenu("");
    setFolderDeleteArm("");
    const error = await commitFolderChange((data) => deleteFolder(data, kind, folder), `已删除目录「${folder}」`);
    if (!error && activeFolder === `folder:${folder}`) selectFolder("all");
  }

  function chooseFolderColor(folder: string, color: string | null) {
    const kind = activeKind;
    void commitFolderChange((data) => ({ data: setFolderColor(data, kind, folder, color) }), "颜色已更新");
  }

  // Folder editing from Settings works on either kind, not just the open tab, and on 图片 folders (their own store).
  // The image library reports a failure through `onError`; Settings shows it next to the form.
  async function imageFolderTask(run: (onError: (message: string) => void) => Promise<unknown>) {
    let failure = "";
    const result = await run((message) => { failure = message; });
    return result === null || result === false ? failure || "没有保存，请重试" : "";
  }

  async function settingsFolderRename(kind: SettingsFolderKind, from: string, to: string) {
    if (kind === "image") return imageFolderTask((onError) => imageLibrary.renameFolder(from, to, onError));
    const error = await commitFolderChange((data) => renameFolder(data, kind, from, to), "目录已重命名");
    if (!error && activeKind === kind && activeFolder === `folder:${from}`) setActiveFolder(`folder:${normalizeFolderName(to)}`);
    return error;
  }

  async function settingsFolderDelete(kind: SettingsFolderKind, folder: string) {
    if (kind === "image") return imageFolderTask((onError) => imageLibrary.deleteFolder(folder, onError));
    const error = await commitFolderChange((data) => deleteFolder(data, kind, folder), `已删除目录「${folder}」`);
    if (!error && activeKind === kind && activeFolder === `folder:${folder}`) selectFolder("all");
    return error;
  }

  async function settingsFolderAdd(kind: SettingsFolderKind, name: string) {
    if (kind === "image") return imageFolderTask((onError) => imageLibrary.createFolder(name, onError));
    const result = addFolder(foldersRef.current, kind, name);
    if (!result.folder) return "请输入目录名称";
    if (!result.created) return "已有同名目录";
    return commitFolderChange((data) => ({ data: { ...data, folders: addFolder(data.folders, kind, name).folders } }), "目录已创建");
  }

  function settingsFolderColor(kind: SettingsFolderKind, folder: string, color: string | null) {
    if (kind === "image") { if (color) void imageLibrary.setFolderColor(folder, color); return; }
    void commitFolderChange((data) => ({ data: setFolderColor(data, kind, folder, color) }), "颜色已更新");
  }

  // Image folders have no saved order (not sortable in Settings), so only the vault kinds move.
  function settingsFolderMove(kind: SettingsFolderKind, folder: string, delta: -1 | 1) {
    if (kind === "image") return;
    void commitFolderChange((data) => ({ data: { ...data, folders: { ...data.folders, [kind]: moveName(data.folders[kind], folder, delta) } } }), "目录顺序已更新");
  }

  function settingsFolderReorder(kind: SettingsFolderKind, source: string, target: string) {
    if (kind === "image") return;
    void commitFolderChange((data) => ({ data: { ...data, folders: { ...data.folders, [kind]: reorderNames(data.folders[kind], source, target) } } }), "目录顺序已更新");
  }

  function buildSettingsFolderGroups(): SettingsFolderGroup[] {
    const textGroups = (PLAIN_NOTES ? ["snippet"] as const : ["snippet", "secret"] as const).map((kind): SettingsFolderGroup => {
      const colors = { ...buildCategoryColorMap(folders[kind]), ...(folderColors?.[kind] || {}) };
      return {
        kind,
        title: kind === "snippet" ? "话术目录" : `${SECRET_WORD}目录`,
        unit: "条",
        nameMax: 30,
        sortable: true,
        autoColor: true,
        folders: folders[kind].map((name) => ({
          name,
          count: items.filter((item) => !isTrashedItem(item) && (item.kind || "secret") === kind && item.folder === name).length,
          color: colors[name] || UNCATEGORIZED_COLOR,
          locked: Boolean(folderEditBlocker(kind, name)),
        })),
      };
    });
    const imageCountsByFolder = countImagesByFolder(imageLibrary.images ?? [], imageLibrary.folders).byFolder;
    const imageColors = imageFolderColors(imageLibrary.folders);
    return [...textGroups, {
      kind: "image",
      title: "图片目录",
      unit: "张",
      nameMax: IMAGE_FOLDER_NAME_MAX,
      sortable: false,
      autoColor: false,
      folders: imageLibrary.folders.map(({ name }) => ({ name, count: imageCountsByFolder[name] ?? 0, color: imageColors[name] || UNCATEGORIZED_COLOR, locked: false })),
    }];
  }

  function requestTrash(item: SecretItem) {
    closeEditor();
    void trashNow(item);
  }

  // Moving to trash is reversible, so it happens immediately and offers an undo
  // instead of a confirmation dialog.
  async function trashNow(target: SecretItem | SecretItem[]) {
    const list = Array.isArray(target) ? target : [target];
    if (list.length === 0) return;
    const ids = list.map((item) => item.id);
    try {
      await persist((current) => ({ ...current, items: moveItemsToTrash(current.items, ids, timestampNow()) }));
    } catch {
      setToast("移入回收站失败，条目保持原位");
      window.setTimeout(() => setToast(""), 2400);
      return;
    }
    setSelected(0);
    setRevealedId("");
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setUndoTrash(list);
    undoTimerRef.current = window.setTimeout(() => setUndoTrash(null), 6000);
  }

  async function undoTrashNow() {
    const list = undoTrash;
    if (!list) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setUndoTrash(null);
    try {
      await persist((current) => ({ ...current, items: restoreTrashedItems(current.items, list.map((item) => item.id)) }));
      setSelected(0);
      setToast(list.length > 1 ? `已恢复 ${list.length} 条` : "已恢复到原目录");
    } catch {
      setToast("恢复失败，内容仍保留在回收站");
    }
    window.setTimeout(() => setToast(""), 2200);
  }

  function exitBulk() {
    setBulkMode(false);
    setBulkIds([]);
    setBulkMoveOpen(false);
  }

  function toggleBulk(id: string) {
    setBulkMode(true);
    setRowMenuId("");
    setRevealedId("");
    setBulkIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function bulkMoveTo(folder: string) {
    const ids = bulkIds.filter((id) => filtered.some((item) => item.id === id));
    setBulkMoveOpen(false);
    if (ids.length === 0) return;
    try {
      await persist((current) => ({ ...current, items: moveItemsToFolder(current.items, ids, folder, timestampNow()) }));
      setToast(folder ? `已把 ${ids.length} 条移到「${folder}」` : `已把 ${ids.length} 条移到未分类`);
    } catch {
      setToast("移动失败，条目保持原位");
    }
    window.setTimeout(() => setToast(""), 2200);
    exitBulk();
  }

  async function bulkTrash() {
    const targets = filtered.filter((item) => bulkIds.includes(item.id));
    exitBulk();
    await trashNow(targets);
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

  const [miniHidePolicy, setMiniHidePolicy] = useState<MiniHidePolicy>(() => readStoredChoice<MiniHidePolicy>(MINI_HIDE_KEY, ["hotkey", "always", "never"], "hotkey"));
  const [trashDays, setTrashDays] = useState<number>(() => readStoredChoice<number>(TRASH_DAYS_KEY, TRASH_DAY_OPTIONS, DEFAULT_TRASH_DAYS));
  useEffect(() => {
    window.clipboxDesktop?.setMiniHidePolicy?.(miniHidePolicy);
    // Only tell the desktop shell about the stored choice once on start; later changes go through chooseMiniHidePolicy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [closeBehavior, setCloseBehavior] = useState<CloseBehavior>(() => readStoredChoice<CloseBehavior>(CLOSE_BEHAVIOR_KEY, ["tray", "taskbar", "quit"], "tray"));
  useEffect(() => {
    window.clipboxDesktop?.setCloseBehavior?.(closeBehavior);
    // Sent once on start; later changes go through chooseCloseBehavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseCloseBehavior(behavior: CloseBehavior) {
    setCloseBehavior(behavior);
    writeStoredChoice(CLOSE_BEHAVIOR_KEY, behavior);
    window.clipboxDesktop?.setCloseBehavior?.(behavior);
  }

  function chooseMiniHidePolicy(policy: MiniHidePolicy) {
    setMiniHidePolicy(policy);
    writeStoredChoice(MINI_HIDE_KEY, policy);
    window.clipboxDesktop?.setMiniHidePolicy?.(policy);
  }

  function chooseTrashDays(days: number) {
    setTrashDays(days);
    writeStoredChoice(TRASH_DAYS_KEY, days);
  }

  // Items that have sat in the trash longer than the chosen retention are removed for good.
  useEffect(() => {
    if (loading || trashDays === 0) return;
    const cutoff = timestampNow() - trashDays * 86_400_000;
    const expired = items.filter((item) => isTrashedItem(item) && (item.deletedAt as number) < cutoff);
    if (expired.length === 0) return;
    const ids = new Set(expired.map((item) => item.id));
    void persist((current) => ({ ...current, items: current.items.filter((item) => !(ids.has(item.id) && isTrashedItem(item))) }))
      .catch(() => setToast("自动清理回收站失败，内容已保留"));
  }, [loading, trashDays, items, persist]);

  const renamingFrom = renamingFolder?.from;
  useEffect(() => {
    if (!renamingFrom) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingFrom]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    window.clipboxDesktop?.setTheme?.(theme);
  }, [theme]);

  function chooseTheme(next: ThemeChoice) {
    setTheme(next);
    writeStoredChoice(THEME_KEY, next);
  }

  async function openDataFolder() {
    try {
      await window.clipboxDesktop?.openDataFolder?.();
    } catch {
      setToast("无法打开数据文件夹");
      window.setTimeout(() => setToast(""), 2200);
    }
  }

  async function emptyTrash() {
    const count = items.filter((item) => isTrashedItem(item)).length;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setUndoTrash(null);
    await persist((current) => ({ ...current, items: current.items.filter((item) => !isTrashedItem(item)) }));
    setToast(`已永久删除 ${count} 条`);
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

  function showImages() {
    if (imageView) return;
    setImageView(true);
    setQuery("");
    setSearchAllFolders(false);
    setSelected(0);
    setRowMenuId("");
    setRevealedId("");
    setFolderMenu("");
    setRenamingFolder(null);
    setNewFolder(null);
    exitBulk();
    if (modalOpen) closeEditor();
    setFill(null);
  }

  function switchKind(kind: ItemKind) {
    if (kind === activeKind && !imageView) return;
    setImageView(false);
    setActiveKind(kind);
    setActiveFolder("all");
    setProductFilter("全部产品");
    setQuery("");
    setSearchAllFolders(false);
    setSelected(0);
    setRowMenuId("");
    setRevealedId("");
    setFolderMenu("");
    setRenamingFolder(null);
    setNewFolder(null);
    exitBulk();
    if (modalOpen) closeEditor();
    setFill(null);
  }

  function selectFolder(folder: string) {
    setActiveFolder(folder);
    if (folder === "trash") setProductFilter("全部产品");
    setSelected(0);
    setRowMenuId("");
    setRevealedId("");
    setFolderMenu("");
    exitBulk();
    setFill(null);
  }

  // Rows slide to their new places when a different entry opens.
  function moveSelection(update: (value: number) => number) {
    const leaving = bulkMode ? undefined : filtered[safeSelected]?.id;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (leaving && !reduceMotion && update(safeSelected) !== safeSelected) {
      setClosingIds((ids) => ids.includes(leaving) ? ids : [...ids, leaving]);
      window.setTimeout(() => setClosingIds((ids) => ids.filter((id) => id !== leaving)), DETAIL_CLOSE_MS + 40);
    }
    setSelected(update);
  }

  function selectRow(index: number) {
    if (fill && filtered[index]?.id !== fill.itemId) setFill(null);
    if (index !== safeSelected) moveSelection(() => index);
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

  async function exportVault(password: string, scope: BackupScope) {
    const currentData = { items: itemsRef.current, folders: foldersRef.current, nextSnippetNumber: nextSnippetNumberRef.current, folderColors: folderColorsRef.current };
    const scopedData = vaultDataForBackupScope(currentData, scope);
    const envelope = await encryptVault(scopedData, password);
    const backup: SecureBackup = { format: "clipbox-secure-backup", version: 3, scope, createdAt: Date.now(), envelope };
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const fileWord = scope === "snippet" ? "snippets" : PLAIN_NOTES ? "notes" : "secrets";
    anchor.download = `clipbox-${fileWord}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupMode(null);
    if (scope === "secret") {
      setToast(`${SECRET_WORD}备份已导出`);
      window.setTimeout(() => setToast(""), 2200);
      return;
    }
    try { localStorage.setItem(LAST_BACKUP_KEY, String(Date.now())); } catch { /* optional hint only */ }
    setLastBackupAt(Date.now());
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
      const rows = await parseSnippetWorkbook(await file.arrayBuffer(), file.name);
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
    setImageView(false);
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
  const sectionTitle = imageView ? imageFilterTitle(imageLibrary.filter) : activeFolder === "all"
    ? (activeKind === "snippet" ? "全部话术" : `全部${SECRET_WORD}`)
    : activeFolder === "pinned" ? "收藏"
      : activeFolder === "recent" ? "最近使用"
      : activeFolder === "trash" ? "回收站"
        : activeFolder === "uncategorized" ? "未分类"
          : activeFolder.slice(7);
  const searchPlaceholder = imageView ? "搜索图片标题" : activeFolder === "trash" ? "搜索回收站" : activeKind === "secret" ? `搜索${SECRET_WORD}标题` : englishSearch ? "搜索英文单词" : "搜索标题、编号或内容";
  const kindSwitch = (
    <ArcSegmented
      className={`kind-switch ${isMini ? "compact" : ""}`}
      label="内容板块"
      value={imageView ? "image" : activeKind}
      onSelect={(next) => { if (next === "image") showImages(); else switchKind(next as ItemKind); }}
      options={[
        ...(PLAIN_NOTES ? ["snippet"] as const : ["snippet", "secret"] as const).map((kind) => ({ value: kind, label: kind === "snippet" ? "话术" : SECRET_WORD })),
        { value: "image", label: "图片" },
      ]}
    />
  );
  const searchInput = <input ref={searchRef} value={query} onChange={(e) => { setQuery(e.target.value); setSelected(0); setRowMenuId(""); if (!e.target.value.trim()) { setSearchAllFolders(false); setEnglishSearch(false); } }} onKeyDown={handleSearchKey} aria-label={searchPlaceholder} placeholder={isMini ? (imageView ? "搜索图片" : activeKind === "secret" ? `搜索${SECRET_WORD}` : "搜索话术") : searchPlaceholder} />;
  const firstRun = activeKindItems.length === 0 && !query && activeFolder === "all" && !isMini;
  const emptyState = (
    <ListEmptyState
      firstRun={firstRun}
      activeKind={activeKind}
      activeFolder={activeFolder}
      query={query}
      searchAllFolders={searchAllFolders}
      isMini={isMini}
      onAdd={() => openEditor(null)}
      onImportSheet={() => spreadsheetFileRef.current?.click()}
      onImportBackup={() => fileRef.current?.click()}
    />
  );
  const showFolderChip = searching && (searchWholeVault || activeFolder === "pinned" || activeFolder === "recent");
  const editorNode = (
    <ItemEditor
      kind={editing?.kind || activeKind}
      item={editing}
      folders={activeFolders}
      defaultFolder={activeFolder.startsWith("folder:") ? activeFolder.slice(7) : ""}
      onClose={closeEditor}
      onDelete={editing ? async () => requestTrash(editing) : undefined}
      onSave={saveItem}
      onCopy={copyTextWithExpiry}
    />
  );
  const bulkCount = bulkIds.filter((id) => filtered.some((item) => item.id === id)).length;
  const isStandardFolder = (folder: string) => Boolean(folderEditBlocker(activeKind, folder));

  const renderFolderRow = (folder: string) => {
    const standard = isStandardFolder(folder);
    const sortable = !standard;
    const active = activeFolder === `folder:${folder}`;
    const renaming = renamingFolder?.from === folder;
    const count = activeKindItems.filter((item) => item.folder === folder).length;
    return (
      <FolderRow
        key={folder}
        folder={folder}
        sortable={sortable}
        active={active}
        count={count}
        color={categoryColors[folder]}
        dragging={folderReorder.draggingId === folder}
        dragOver={folderReorder.overId === folder && folderReorder.draggingId !== folder}
        renaming={renaming ? renamingFolder : null}
        renameInputRef={renameInputRef}
        menuOpen={folderMenu === folder}
        onSelect={() => selectFolder(`folder:${folder}`)}
        onSubmitRename={() => { void submitFolderRename(); }}
        onRenameChange={setRenamingFolder}
        onRenameCancel={() => setRenamingFolder(null)}
        onRenameBlur={() => window.setTimeout(() => setRenamingFolder((current) => current?.from === folder ? null : current), 120)}
        onOpenMenu={(rect) => {
          setFolderDeleteArm("");
          setFolderMenuPos({ top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 270)), left: rect.left });
          setFolderMenu((value) => value === folder ? "" : folder);
        }}
        onBeginDrag={(event) => folderReorder.beginPointerDrag(event, folder)}
      />
    );
  };
  const menuFolder = folderMenu && activeFolders.includes(folderMenu) ? folderMenu : "";
  const menuFolderCount = menuFolder ? activeKindItems.filter((item) => item.folder === menuFolder).length : 0;

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
              {imageView && <ImageFolderSelect library={imageLibrary} />}
              {!imageView && <label className="mini-folder">
                <span className="sr-only">目录</span>
                <select value={activeFolder} onChange={(event) => selectFolder(event.target.value)}>
                  <option value="all">全部</option>
                  <option value="pinned">收藏</option>
                  <option value="recent">最近使用</option>
                  {activeFolders.map((folder) => <option key={folder} value={`folder:${folder}`}>{folder}</option>)}
                  {activeKind === "secret" && <option value="uncategorized">未分类</option>}
                </select>
                <Icon name="chevron" />
              </label>}
            </div>
          </div>
          {imageView && <ImageSection ref={imageSectionRef} library={imageLibrary} query={query} compact view="grid" paused={backgroundInert} onToast={flashToast} onCounts={setImageCounts} />}
          {!imageView && <div key={`mini:${activeKind}:${activeFolder}`} className="native-list mini-list list-switch">
            {filtered.length === 0 ? emptyState : filtered.map((item, index) => {
              const isSelected = safeSelected === index;
              return (
                <article key={item.id} data-row-index={index} className={`native-row mini-row ${activeKind === "snippet" ? "snippet-row" : "secret-row"} ${isSelected ? "selected" : ""} ${copiedId === item.id ? "copied" : ""}`}>
                  <button type="button" className="row-main" onClick={() => { setSelected(index); void copyRaw(item); }} aria-label={copiedId === item.id ? `已复制 ${item.label}` : `复制 ${item.label}`}>
                    <i className="row-dot" aria-hidden="true" style={{ background: categoryColors[item.folder || ""] || UNCATEGORIZED_COLOR }} />
                    <span className="row-copy">
                      <strong className={activeKind === "snippet" ? "snippet-label" : undefined}>{activeKind === "snippet" ? <SnippetTitle label={item.label} query={query} /> : <Highlight text={item.label} query={query} />}</strong>
                      {activeKind === "snippet" && <small className="snippet-preview" lang="en"><SnippetContent text={item.secret} query={query} /></small>}
                    </span>
                    {item.pinned && <Icon name="star" filled className="row-star" />}
                    {copiedId === item.id && <span className="mini-copied">已复制</span>}
                  </button>
                  {copiedId === item.id && <span className="copy-status" role="status" aria-live="polite">已复制</span>}
                </article>
              );
            })}
          </div>}
          <footer className="status-bar">
            <span className="spacer" />
            <span>{imageView ? `${imageCounts.shown} 张` : `${filtered.length} 条`}</span>
          </footer>
        </> : <>
          <aside className="sidebar" aria-label="目录">
            <div className="sidebar-top drag-region"><div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div></div>
            {kindSwitch}
            {imageView ? <ImageFolderNav library={imageLibrary} /> : <>
            <nav className="nav-list" aria-label="快捷入口">
              {directoryShortcuts.map((shortcut) => <button key={shortcut.id} type="button" className={`nav-item ${activeFolder === shortcut.id ? "active" : ""}`} onClick={() => selectFolder(shortcut.id)}><span className="nav-icon"><Icon name={shortcut.id === "pinned" ? "star" : shortcut.id === "recent" ? "clock" : "grid"} className={shortcut.id === "all" ? "accent" : undefined} /></span><span className="nav-label">{shortcut.id === "all" ? "全部" : shortcut.label}</span><b>{shortcut.count}</b></button>)}
            </nav>
            <div className="nav-heading">
              <span>目录</span>
              <button ref={folderCreateButtonRef} type="button" onClick={startNewFolder} aria-label="新建目录" title="新建目录"><Icon name="plus" /></button>
            </div>
            <div className="nav-scroll directory-list">
              {activeFolders.map(renderFolderRow)}
              {newFolder && (
                <form className="directory-new" onSubmit={(event) => { event.preventDefault(); void submitNewFolder(); }}>
                  <i className="directory-color-marker hollow" aria-hidden="true" />
                  <input ref={newFolderInputRef} value={newFolder.name} placeholder="目录名称，回车创建" aria-label="新目录名称" aria-invalid={Boolean(newFolder.error)} maxLength={30}
                    onChange={(event) => setNewFolder({ name: event.target.value, error: "" })}
                    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelNewFolder(); } }}
                    onBlur={() => window.setTimeout(() => setNewFolder((current) => current && !current.name.trim() ? null : current), 120)} />
                  {newFolder.error && <small className="directory-error" role="alert">{newFolder.error}</small>}
                </form>
              )}
              {activeKind === "secret" && <div className={`directory-row fixed ${activeFolder === "uncategorized" ? "active" : ""}`}><button type="button" className="nav-item directory-main" onClick={() => selectFolder("uncategorized")}><span className="nav-icon"><i className="directory-color-marker hollow" aria-hidden="true" /></span><span className="nav-label">未分类</span><b>{activeKindItems.filter((item) => !item.folder?.trim()).length}</b></button></div>}
            </div></>}
            <div className="nav-footer">
              {!imageView && <button type="button" className={`nav-item ${activeFolder === "trash" ? "active" : ""}`} onClick={() => selectFolder("trash")}><span className="nav-icon"><Icon name="trash" /></span><span className="nav-label">回收站</span>{trashedKindItems.length > 0 && <b>{trashedKindItems.length}</b>}</button>}
              <button type="button" className={`nav-item ${settingsOpen ? "active" : ""}`} onClick={() => setSettingsOpen(true)} aria-haspopup="dialog" aria-label="设置"><span className="nav-icon"><Icon name="settings" /></span><span className="nav-label">设置</span></button>
              <input ref={fileRef} className="hidden-input" type="file" accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importVault(file); event.target.value = ""; }} />
              <input ref={spreadsheetFileRef} className="hidden-input" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepareSnippetImport(file); event.target.value = ""; }} />
            </div>
          </aside>
          {menuFolder && <>
            <div className="menu-scrim" role="presentation" onMouseDown={() => { setFolderMenu(""); setFolderDeleteArm(""); }} />
            <div className="dropdown folder-menu" role="menu" aria-label={`管理目录 ${menuFolder}`} style={{ top: folderMenuPos.top, left: folderMenuPos.left }}>
              <button type="button" role="menuitem" disabled={isStandardFolder(menuFolder)} title={isStandardFolder(menuFolder) ? "标准话术目录不能改名" : undefined} onClick={() => { setFolderMenu(""); setRenamingFolder({ from: menuFolder, value: menuFolder, error: "" }); }}>重命名</button>
              <p className="menu-label">颜色</p>
              <div className="swatches" role="group" aria-label="目录颜色">{CATEGORY_PALETTE.map((color) => <button key={color} type="button" aria-label={`颜色 ${color}`} aria-pressed={categoryColors[menuFolder]?.toLowerCase() === color.toLowerCase()} className={categoryColors[menuFolder]?.toLowerCase() === color.toLowerCase() ? "on" : ""} style={{ background: color }} onClick={() => { setFolderMenu(""); chooseFolderColor(menuFolder, color); }} />)}</div>
              <button type="button" role="menuitem" onClick={() => { setFolderMenu(""); chooseFolderColor(menuFolder, null); }}>恢复自动颜色</button>
              <div className="menu-divider" />
              {folderDeleteArm === menuFolder
                ? <button type="button" role="menuitem" className="danger" onClick={() => void removeFolder(menuFolder)}>{activeKind === "secret" && menuFolderCount > 0 ? `确认删除，${menuFolderCount} 条移到未分类` : "确认删除"}</button>
                : <button type="button" role="menuitem" className="danger" disabled={isStandardFolder(menuFolder)} title={isStandardFolder(menuFolder) ? "标准话术目录不能删除" : undefined} onClick={() => setFolderDeleteArm(menuFolder)}>删除目录…</button>}
            </div>
          </>}

          <section className="content-panel">
            <UpdateNotice />
            <header className="toolbar drag-region">
              <div className="native-search">
                <Icon name="search" className="search-glyph" />
                {searchInput}
              </div>
              {imageView
                ? <button type="button" className="primary-button add-button" onClick={() => imageSectionRef.current?.openPicker()} aria-label="新增图片"><Icon name="plus" />新增图片</button>
                : canAddItemInFolder(activeFolder) && <button type="button" className="primary-button add-button" onClick={() => openEditor(null)} aria-label="新增条目"><Icon name="plus" />新增</button>}
              <button type="button" className="icon-button" onClick={() => requestWindowMode("mini")} aria-label="迷你模式" title="迷你模式"><Icon name="mini" /></button>
            </header>
            <div className="section-head">
              <h1>{sectionTitle}</h1>
              <span className="section-count">{imageView ? imageCounts.shown : filtered.length}</span>
              <span className="spacer" />
              {!imageView && searching && activeKind === "snippet" && activeFolder !== "trash" && <ArcSegmented
                className="scope-switch"
                label="搜索方式"
                value={englishSearch ? "english" : "pinyin"}
                onSelect={(next) => { setEnglishSearch(next === "english"); setSelected(0); }}
                options={[{ value: "pinyin", label: "中文拼音" }, { value: "english", label: "英文单词" }]}
              />}
              {!imageView && searching && activeFolder !== "all" && activeFolder !== "trash" && <ArcSegmented
                className="scope-switch"
                label="搜索范围"
                value={searchAllFolders ? "all" : "here"}
                onSelect={(next) => { setSearchAllFolders(next === "all"); setSelected(0); }}
                options={[{ value: "here", label: "此目录" }, { value: "all", label: "全部目录" }]}
              />}
              {!imageView && activeFolder !== "trash" && filtered.length > 0 && !modalOpen && <button type="button" className={`ghost-button select-toggle ${bulkMode ? "active" : ""}`} aria-pressed={bulkMode} onClick={() => bulkMode ? exitBulk() : setBulkMode(true)}>{bulkMode ? "取消选择" : "选择"}</button>}
              {!imageView && activeKind === "snippet" && activeFolder !== "trash" && <div className="product-filter-wrap">
                <button type="button" className={productFilter !== "全部产品" ? "product-filter active" : "product-filter"} onClick={() => setProductMenuOpen((value) => !value)} aria-expanded={productMenuOpen}>{productFilter}<Icon name="chevron" /></button>
                <AnimatePresence>{productMenuOpen && <ArcMenu className="product-filter-menu">
                  {["全部产品", ...PRODUCT_GROUPS].map((product) => <button type="button" role="menuitem" className={productFilter === product ? "active" : ""} key={product} onClick={() => { setProductFilter(product); setProductMenuOpen(false); setSelected(0); }}>{product}<span>{productFilter === product ? "✓" : ""}</span></button>)}
                </ArcMenu>}</AnimatePresence>
              </div>}
              {!imageView && activeKind === "secret" && !PLAIN_NOTES && activeFolder !== "trash" && <span className="section-note"><Icon name="lock" />本机加密</span>}
              {imageView && <ImageViewSwitch view={imageViewMode} onChange={setImageViewMode} />}
            </div>
            {imageView && <ImageSection ref={imageSectionRef} library={imageLibrary} query={query} compact={false} view={imageViewMode} paused={backgroundInert} onToast={flashToast} onCounts={setImageCounts} />}
            {!imageView && <div key={`${activeKind}:${activeFolder}`} className={`native-list list-switch ${bulkMode ? "bulk" : ""}`}>
              {modalOpen && !editing && activeFolder !== "trash" && <article className={`native-row selected editing new-row ${activeKind === "snippet" ? "snippet-row" : "secret-row"}`}>{editorNode}</article>}
              {filtered.length === 0 ? (modalOpen && !editing ? null : emptyState) : activeFolder === "trash" ? filtered.map((item, index) => (
                <article key={item.id} data-row-index={index} className={`native-row trash-row ${activeKind === "snippet" ? "snippet-row" : "secret-row"} ${safeSelected === index ? "selected" : ""}`}>
                  <span className="trash-row-icon" aria-hidden="true"><Icon name="trash" /></span>
                  <div className="row-main trash-row-main">
                    <span className="row-copy"><strong className={activeKind === "snippet" ? "snippet-label" : undefined}>{activeKind === "snippet" ? <SnippetTitle label={item.label} query={query} /> : <Highlight text={item.label} query={query} />}</strong><small>{item.folder || "未分类"}</small></span>
                  </div>
                  <button type="button" className="trash-restore" onClick={() => void restoreItem(item)} aria-label={`恢复 ${item.label}`}>恢复</button>
                  <button type="button" className="trash-permanent" onClick={() => setDeleteRequest({ item, permanent: true })} aria-label={`永久删除 ${item.label}`}>永久删除</button>
                </article>
              )) : filtered.map((item, index) => {
                const isSnippet = activeKind === "snippet";
                if (modalOpen && editing?.id === item.id) {
                  return <article key={item.id} data-row-index={index} className={`native-row selected editing ${isSnippet ? "snippet-row" : "secret-row"}`}>{editorNode}</article>;
                }
                const isSelected = safeSelected === index && !bulkMode;
                const checked = bulkIds.includes(item.id);
                const revealed = revealedId === item.id;
                const closing = !isSelected && !bulkMode && closingIds.includes(item.id);
                const moveTargets = [...activeFolders, ...(isSnippet ? [] : [""])].filter((folder) => folder !== (item.folder || ""));
                return (
                  <article key={item.id} data-row-index={index} data-sort-scope="card" data-sort-id={item.id} className={`native-row ${isSnippet ? "snippet-row" : "secret-row"} ${item.pinned ? "pinned" : ""} ${isSelected || closing ? "selected" : ""} ${closing ? "closing-row" : ""} ${checked ? "checked" : ""} ${copiedId === item.id ? "copied" : ""} ${copiedReferenceId === item.id ? "reference-copied" : ""} ${cardReorder.draggingId === item.id ? "dragging" : ""} ${cardReorder.overId === item.id && cardReorder.draggingId !== item.id ? "drag-over" : ""}`}>
                    <div className="row-line">
                      {bulkMode
                        ? <button type="button" className={`row-check ${checked ? "on" : ""}`} role="checkbox" aria-checked={checked} aria-label={`选择 ${item.label}`} onClick={() => toggleBulk(item.id)}><Icon name="check" /></button>
                        : <button type="button" className="drag-handle" disabled={!cardDragEnabled} aria-label={`拖动排序 ${item.label}`} title={cardDragEnabled ? "拖动排序" : "清除搜索和筛选后可排序"} onPointerDown={(event) => cardReorder.beginPointerDrag(event, item.id)}><i style={{ background: categoryColors[item.folder || ""] || UNCATEGORIZED_COLOR }} /></button>}
                      <button type="button" className="row-main" onClick={() => { if (bulkMode) { toggleBulk(item.id); return; } selectRow(index); }} onDoubleClick={() => { if (!bulkMode) void copy(item); }} aria-expanded={bulkMode ? undefined : isSelected} aria-label={bulkMode ? `选择 ${item.label}` : `${isSelected ? "已展开" : "展开"} ${item.label}`}>
                        <span className="row-copy">
                          <span className="row-title">
                            <strong className={isSnippet ? "snippet-label" : undefined}>{isSnippet ? <SnippetTitle label={item.label} query={query} /> : <Highlight text={item.label} query={query} />}</strong>
                            {isSelected && isSnippet && item.snippetNumber && <b className="row-snippet-number">{item.snippetNumber}</b>}
                            {showFolderChip && item.folder && <small className="row-folder">{item.folder}</small>}
                          </span>
                          {!isSelected && isSnippet && <small className="snippet-preview" lang="en"><SnippetContent text={item.secret} query={query} /></small>}
                        </span>
                      </button>
                      {!isSnippet && !PLAIN_NOTES && <button type="button" className="native-reference" onClick={() => void copySecretReference(item)} aria-label={copiedReferenceId === item.id ? `已复制引用 ${item.label}` : `复制引用 ${item.label}`} title={copiedReferenceId === item.id ? "引用已复制" : "复制引用，发给其他任务"}><span className="reference-glyph" aria-hidden="true" /><span className="reference-check" aria-hidden="true">✓</span></button>}
                      <button type="button" className="native-copy" onClick={() => void copy(item)} aria-label={copiedId === item.id ? `已复制 ${item.label}` : `复制 ${item.label}`} title={copiedId === item.id ? "已复制" : "复制"}><span className="copy-glyph" aria-hidden="true" /><span className="copy-check" aria-hidden="true">✓</span></button>
                      <button type="button" className="native-pin" onClick={() => togglePinned(item)} aria-label={`${item.pinned ? "取消收藏" : "收藏"} ${item.label}`} aria-pressed={Boolean(item.pinned)} title={item.pinned ? "取消收藏" : "收藏"}><Icon name="star" filled={Boolean(item.pinned)} /></button>
                      {copiedId === item.id && <span className="copy-status" role="status" aria-live="polite">已复制</span>}
                      {!PLAIN_NOTES && copiedReferenceId === item.id && <span className="copy-status" role="status" aria-live="polite">引用已复制</span>}
                    </div>
                    {(isSelected || closing) && <div className={`row-detail ${closing ? "closing" : ""}`} inert={closing} aria-hidden={closing || undefined}><div className="row-detail-inner">
                      {isSnippet ? (hasOptionalSnippetPreparation(item) ? <SnippetFill item={item} state={fillFor(item)} onState={updateFill(item)} renderText={(text) => <Highlight text={text} query={query} />} onSubmit={() => void copy(item)} onActive={(name) => setActiveVar(name ? { id: item.id, name } : null)} onFocusChange={setTypingVariable} /> : <p className="row-content" lang="en"><SnippetContent text={item.secret} query={query} /></p>) : PLAIN_NOTES ? <p className="row-content"><Highlight text={item.secret} query={query} /></p> : (
                        <div className={`row-secret ${revealed ? "revealed" : ""}`}>
                          <span className="row-secret-value">{revealed ? item.secret : "••••••••••••••••"}</span>
                          <button type="button" className="ghost-button reveal-button" aria-pressed={revealed} onPointerDown={() => setRevealedId(item.id)} onPointerUp={() => setRevealedId("")} onPointerLeave={() => setRevealedId("")} onPointerCancel={() => setRevealedId("")} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); setRevealedId(item.id); } }} onKeyUp={() => setRevealedId("")} onBlur={() => setRevealedId("")}><Icon name="eye" />按住显示</button>
                        </div>
                      )}
                      <div className="row-actions">
                          <button type="button" className="primary-button" onClick={() => void copy(item)}><Icon name={copiedId === item.id ? "check" : "copy"} />{copiedId === item.id ? "已复制" : isSnippet && fillFor(item).language === "zh" ? "复制中文" : "复制"}</button>
                          {!isSnippet && !PLAIN_NOTES && <button type="button" className="secondary-button" onClick={() => void copySecretReference(item)} title={`只复制编号，${SECRET_WORD}本身不会出现在聊天或日志里`}><Icon name={copiedReferenceId === item.id ? "check" : "link"} />{copiedReferenceId === item.id ? "引用已复制" : "复制引用"}</button>}
                          <button type="button" className="ghost-button" onClick={() => openEditor(item)}>编辑</button>
                          {isSnippet && activeVar?.id === item.id && (valueMemory[activeVar.name] || []).length > 0 && <span className="var-memory" role="listbox" aria-label={`${activeVar.name} 最近用过的`}>
                            {/* mousedown is stopped so the block keeps focus until the click lands */}
                            {(valueMemory[activeVar.name] || []).map((option) => <button key={option} type="button" role="option" aria-selected={option === fillFor(item).values[activeVar.name]} title={option} className="var-memory-option" onMouseDown={(event) => event.preventDefault()} onClick={() => pickRemembered(item, activeVar.name, option)}>{option}</button>)}
                          </span>}
                          <span className="spacer" />
                          <div className="menu-wrap">
                            <button type="button" className="icon-button" aria-label={`更多操作 ${item.label}`} aria-expanded={rowMenuId === item.id} onClick={() => setRowMenuId((value) => value === item.id ? "" : item.id)}><Icon name="more" /></button>
                            <AnimatePresence>{rowMenuId === item.id && <ArcMenu className="dropdown row-menu">
                              {moveTargets.length > 0 && <p className="menu-label">移动到</p>}
                              {moveTargets.map((folder) => <button type="button" role="menuitem" key={folder || "uncategorized"} onClick={() => void moveItemToFolder(item, folder)}><i className="menu-dot" aria-hidden="true" style={{ background: folder ? categoryColors[folder] : UNCATEGORIZED_COLOR }} />{folder || "未分类"}</button>)}
                              {moveTargets.length > 0 && <div className="menu-divider" />}
                              <button type="button" role="menuitem" className="danger" onClick={() => { setRowMenuId(""); void trashNow(item); }}>移到回收站</button>
                            </ArcMenu>}</AnimatePresence>
                          </div>
                        </div>
                      {!isSnippet && !PLAIN_NOTES && <p className="row-hint">复制引用只复制编号，交给本机其他任务读取，{SECRET_WORD}本身不会出现在聊天或日志里。</p>}
                    </div></div>}
                  </article>
                );
              })}
            </div>}
            {bulkMode && <div className="bulk-bar" role="toolbar" aria-label="批量操作">
              <strong>已选 {bulkCount} 条</strong>
              <button type="button" className="ghost-button" onClick={() => setBulkIds(bulkCount === filtered.length ? [] : filtered.map((item) => item.id))}>{bulkCount === filtered.length ? "全不选" : "全选"}</button>
              <span className="spacer" />
              <div className="menu-wrap">
                <button type="button" className="secondary-button" disabled={bulkCount === 0} aria-expanded={bulkMoveOpen} onClick={() => setBulkMoveOpen((value) => !value)}>移动到<Icon name="chevron" /></button>
                <AnimatePresence>{bulkMoveOpen && <ArcMenu className="dropdown bulk-menu" origin="bottom left">
                  {[...activeFolders, ...(activeKind === "secret" ? [""] : [])].map((folder) => <button type="button" role="menuitem" key={folder || "uncategorized"} onClick={() => void bulkMoveTo(folder)}><i className="menu-dot" aria-hidden="true" style={{ background: folder ? categoryColors[folder] : UNCATEGORIZED_COLOR }} />{folder || "未分类"}</button>)}
                </ArcMenu>}</AnimatePresence>
              </div>
              <button type="button" className="secondary-button danger-text" disabled={bulkCount === 0} onClick={() => void bulkTrash()}>移到回收站</button>
              <button type="button" className="primary-button" onClick={exitBulk}>完成</button>
            </div>}
          </section>
        </>}
      </section>
      {settingsOpen && <SettingsDialog
        version={appVersion}
        isDesktop={Boolean(typeof window !== "undefined" && window.clipboxDesktop)}
        refreshing={refreshing}
        trashCount={items.filter((item) => isTrashedItem(item)).length}
        itemCount={items.filter((item) => !isTrashedItem(item)).length}
        miniHidePolicy={miniHidePolicy}
        onMiniHidePolicy={chooseMiniHidePolicy}
        folderGroups={buildSettingsFolderGroups()}
        onFolderAdd={settingsFolderAdd}
        onFolderRename={settingsFolderRename}
        onFolderDelete={settingsFolderDelete}
        onFolderColor={settingsFolderColor}
        onFolderMove={settingsFolderMove}
        onFolderReorder={settingsFolderReorder}
        closeBehavior={closeBehavior}
        onCloseBehavior={chooseCloseBehavior}
        trashDays={trashDays}
        onTrashDays={chooseTrashDays}
        onEmptyTrash={emptyTrash}
        theme={theme}
        onTheme={chooseTheme}
        lastBackupAt={lastBackupAt}
        onOpenDataFolder={openDataFolder}
        onClose={() => setSettingsOpen(false)}
        onExport={() => { setSettingsOpen(false); setBackupMode("export"); }}
        onExportSecret={() => { setSettingsOpen(false); setBackupMode("export-secret"); }}
        onImport={() => { setSettingsOpen(false); fileRef.current?.click(); }}
        onImportSheet={() => { setSettingsOpen(false); spreadsheetFileRef.current?.click(); }}
        onReload={() => { setSettingsOpen(false); void refreshLocalVault(); }}
        onMini={() => { setSettingsOpen(false); requestWindowMode("mini"); }}
      />}
      {deleteRequest && <DeleteConfirmDialog request={deleteRequest} onClose={() => setDeleteRequest(null)} onConfirm={confirmDelete} />}
      {backupMode && <BackupDialog
        mode={backupMode}
        secretWord={PLAIN_NOTES ? "" : SECRET_WORD}
        needsPassword={backupMode !== "import" || Boolean(pendingImport?.envelope)}
        onClose={() => { setBackupMode(null); if (backupMode === "import") setPendingImport(null); }}
        onExport={(password) => exportVault(password, backupMode === "export-secret" ? "secret" : "snippet")}
        onImport={applyImport}
      />}
      {snippetImport && <SnippetImportDialog preview={snippetImport} fileName={snippetImportName} secretWord={PLAIN_NOTES ? "" : SECRET_WORD} onClose={() => { setSnippetImport(null); setSnippetImportName(""); }} onImport={applySnippetImport} />}
      <ArcToast
        message={undoTrash ? (undoTrash.length > 1 ? `已移入回收站 ${undoTrash.length} 条` : "已移入回收站") : toast}
        className={undoTrash ? "undo-toast" : undefined}
        action={undoTrash ? { label: "撤销", onClick: () => void undoTrashNow() } : undefined}
      />
    </main>
  );
}
