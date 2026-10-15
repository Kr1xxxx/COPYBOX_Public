"use client";

import { ArcToast } from "./arc/arc-toast";
import { useToast } from "./use-toast";
import { buildCardMoveMap, countItemsByFolder, undoItemSave, type ItemSaveRecord } from "./clipbox-core";
import { copyTextWithExpiry } from "./clipboard";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildCategoryColorMap, CATEGORY_PALETTE, UNCATEGORIZED_COLOR } from "./category-colors";
import {
  canReorderCards,
  displaySnippetNumber,
  moveName,
  moveVisibleItem,
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
  type FolderShortNames,
  deleteFolder,
  folderEditBlocker,
  moveItemsToFolder,
  moveItemsToTrash,
  renameFolder,
  restoreTrashedItems,
  setFolderColor,
  setFolderShortName,
  type BackupScope,
  type ImportStrategy,
  type ItemKind,
  type SecretItem,
  synchronizeVaultData,
  type VaultData,
  vaultDataForBackupScope,
  moveItemToTrash,
} from "./clipbox-core";
import { recordCopy } from "./usage-ranking";
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
import { createLazyWriter, type LazyWriter } from "./lazy-writer";
import { derivePbkdf2AesKey } from "./key-cache";
import { DEVICE_KEY, deviceKeyCandidates, secureKeyStore, settleDeviceKey } from "./device-key-store";
import { loadSecretSettings } from "./secret-settings";
import { assertWritesOpen, onQuiesce, writesClosed } from "./write-gate";
import { drainAll } from "./store-queue";
import { waitForImageWrites } from "./image-store";
import { isQuotaError, isStorageNearlyFull, STORAGE_FULL_MESSAGE, STORAGE_NEARLY_FULL_MESSAGE } from "./clipbox-core";
import { FolderRow } from "./folder-row";
import { ListEmptyState } from "./list-empty-state";
import { PLAIN_NOTES, SECRET_WORD } from "./platform";
import { RevealButtons, useReveal } from "./reveal-buttons";
import { Highlight, Icon, SnippetContent, SnippetTitle, VaultMark } from "./ui-atoms";
import "./desktop-bridge";
import type { WindowMode } from "./desktop-bridge";
import { DEFAULT_TRASH_DAYS, TRASH_DAY_OPTIONS, type CloseBehavior, type MiniHidePolicy, type ThemeChoice } from "./preferences";
import { ItemEditor } from "./item-editor";
import { ImageFolderNav } from "./image-folders";
import { MiniTabs, type MiniTab } from "./mini-tabs";
import { folderShortName } from "./folder-short-name";
import { FirstRunGuide, useFirstRunGuide } from "./first-run-guide";
import { countImagesByFolder, IMAGE_FILTER_ALL, IMAGE_FILTER_PINNED, IMAGE_FILTER_RECENT, IMAGE_FILTER_TRASH, IMAGE_FILTER_UNCATEGORIZED, imageFilterTitle, imageFolderColors, imageFolderFilter } from "./image-folders-core";
import { IMAGE_FOLDER_NAME_MAX, type ImageMeta } from "./image-store";
import { useImageLibrary } from "./image-library";
import { ImageSection, type ImageCounts, type ImageSectionHandle } from "./image-section";
import { ArcSegmented } from "./arc/segmented";
import { type LockMode, isAccountLockSet, lockMode } from "./account-lock";
import { AccountLockScreen } from "./account-lock-ui";
import { AccountVeil } from "./account-veil";
import { readSlideUnlockOn, writeSlideUnlockOn } from "./slide-unlock";
import { AccountPage, type AddRequest } from "./account-page";
import { countByKind, useAccountEntries, type LegacySecret } from "./account-entries";
import { CATEGORY_LABEL, CATEGORY_ORDER, type EntryKind } from "./account-view";
import { clearSampleEntries, previewClearSamples, restoreSampleEntries } from "./vault-samples";
import { useAutoBackup } from "./auto-backup-ui";
import { applyImportSampleSnippets, planClearSampleSnippets, planImportSampleSnippets } from "./sample-snippets";
import { decryptVaultBox, encryptVaultBox, isSaneIterationCount, isVaultBoxEmpty, looksLikeVaultBox, mergeVaultBox, type VaultBoxEnvelope, type VaultBoxPayload } from "./vault-backup";
import { openSecretItemsStore } from "./secret-items-store";
import { openTotpStore } from "./totp-store";
import { ArcMenu } from "./arc/menu";
import { ReorderHandle } from "./reorder-handle";
import { AnimatePresence } from "motion/react";
import { ImageViewSwitch, useImageView } from "./image-view";
import { SettingsDialog } from "./settings";
import type { SettingsFolderGroup, SettingsFolderKind } from "./settings-folders";
import { BackupDialog, DeleteConfirmDialog, SnippetImportDialog, type BackupMode, type DeleteRequest } from "./dialogs";
import { SharedLibrarySection, SharedNotice, SyncCodeRow } from "./shared-library-ui";
import { CloudAccountRows, useCloudSync } from "./cloud-sync-ui";
import { isSyncedSnippet, mergeAccounts, mergeSnippets, syncPolicy, tooManyRemovals } from "./cloud-sync-core";
import { SHARED_SYNC_INTERVAL_MS, acceptSharedUpdate, presetLibraryText, exportSharedLibrary, keepMySharedVersion, parseSharedLibrary, sharedMark, syncSharedLibrary, describeSync, type SyncSummary } from "./shared-library";
import { fetchSharedLibraryText, readSharedUrl, writeSharedSummary } from "./shared-library-client";
import { SnippetFill, VariableMenu, VariablePopup, emptyFillState, type CopyLanguage, type SnippetFillState } from "./fill-panel";
import { readRefreshedImageView, readStoredChoice, writeStoredChoice } from "./stored-choice";
import { useDropdownDismiss, useRowMenuPlacement } from "./dropdown-menus";
import { useValueOptionDrag } from "./value-option-drag";
import { PINNED_KEY, fixedOptions, deleteValue, isPinned, latestValues, memoryOptions, moveOption, parsePinned, quickFillValues, rememberValues, togglePin, type PinnedValues, type ValueMemory } from "./variable-memory";
import { searchSnippets, searchSnippetsEnglish } from "./snippet-search";
import { UpdateNotice } from "./update-notice";
import { usePointerReorder } from "./use-pointer-reorder";
import { useSortFlipAnimation } from "./use-sort-flip-animation";
import { onRowAnimationEnd } from "./row-entrance";
import { ListScrollFrame } from "./list-scroll-rail";
import { DailyTipsCard } from "./daily-tips-card";
import { AutomationCommandError, commitSnippetAutomationCommand, formatSecretReference, isAutomationReadAction, parseSecretExportCommand, secretAutomationAction, secretGateRefusal } from "./clipbox-automation";
import { useAutomationConsent } from "./automation-consent";
import { parseAutomationCaller } from "./automation-trust";
import { isApiKeySecretCommand, runApiKeySecretCommand } from "./apikey-automation";

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
  | { format: "clipbox-secure-backup"; version: 3; scope: BackupScope; createdAt: number; envelope: VaultEnvelope; vaultBox?: VaultBoxEnvelope };

type PendingImport = { envelope?: VaultEnvelope; legacyData?: VaultData; scope?: BackupScope; vaultBox?: VaultBoxEnvelope };
// Windows has no old 秘密 list: one shared empty list, so the 账号 stores are not re-read on every change.
const NO_LEGACY_SECRETS: LegacySecret[] = [];
const NO_FOLDERS: string[] = [];
const DETAIL_CLOSE_MS = 220;
// 登录同步: one sync that would delete most of what is here is refused (cloud-sync-core.ts tooManyRemovals).
const CLOUD_TOO_MANY_REMOVALS = "云端的内容比这台电脑少了很多，为了安全这次没有同步，这台电脑上的内容没有变化";
const CLOUD_NOTHING_TO_WRITE = new Error("nothing to write");
const CLOSE_BEHAVIOR_KEY = "clipbox.close-behavior";
const THEME_KEY = "clipbox.theme";
const LAST_BACKUP_KEY = "clipbox.last-backup-at";
const THEME_OPTIONS = ["system", "light", "dark"] as const;
const MINI_HIDE_KEY = "clipbox.mini-hide-policy";
// 固定在最上层 for the full window: "1" when on, absent when off.
const PIN_ON_TOP_KEY = "clipbox.pin-on-top";
const TRASH_DAYS_KEY = "clipbox.trash-retention-days";
const VALUES_COLLAPSED_KEY = "clipbox.values-collapsed";
// The 话术 card that was open last (only its id), so the list comes back the way it was; empty = all folded.
const OPEN_CARD_KEY = "clipbox.open-card";

const STORAGE_KEY = "clipbox.vault.v1";
const REFRESH_CONTEXT_KEY = "clipbox:refresh-context";
const ITERATIONS = 310_000;

function timestampNow() {
  return Date.now();
}

function bytesToBase64(bytes: Uint8Array) {
  // 32 KB at a time: one call per byte is slow for a large vault, one call for everything overflows the stack.
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function createDeviceKey() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
}

// The vault keeps its salt between saves, so this is the same key every time; it is worked out once (key-cache.ts).
async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  return derivePbkdf2AesKey(password, salt, iterations);
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

// Every key that might open the vault is tried (D-053: on Windows the protected one first, then a copy next to the data,
// e.g. one a 完整备份 restore just wrote); the first that opens it is the device key.
async function readLocalEncryptedVault() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const keys = await deviceKeyCandidates(localStorage, secureKeyStore(), DEVICE_KEY);
  if (!raw || keys.length === 0) throw new Error("Local vault is unavailable");
  const envelope = JSON.parse(raw) as VaultEnvelope;
  let failure: unknown = new Error("Local vault is unavailable");
  for (const key of keys) {
    try {
      return { data: await decryptVault(envelope, key), deviceKey: key };
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [deviceKey, setDeviceKey] = useState("");
  const [items, setItems] = useState<SecretItem[]>([]);
  const [folders, setFolders] = useState<FolderRegistry>(EMPTY_FOLDER_REGISTRY);
  const [folderColors, setFolderColors] = useState<FolderColors | undefined>(undefined);
  const [folderShortNames, setFolderShortNames] = useState<FolderShortNames | undefined>(undefined);
  const [activeKind, setActiveKind] = useState<ItemKind>(DEFAULT_ITEM_KIND);
  // The 图片 section is not an ItemKind: its data lives in its own store, never in the vault.
  const [imageView, setImageView] = useState(false);
  const [imageCounts, setImageCounts] = useState<ImageCounts>({ total: 0, shown: 0, open: false });
  const imageSectionRef = useRef<ImageSectionHandle>(null);
  const [imageSelectKey, setImageSelectKey] = useState("\u0000");
  const [imageViewMode, setImageViewMode] = useImageView();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Hidden 验证码 (Mac only): the entry appears after the secret gesture in Settings → 关于, and can be hidden again.
  // 保险箱 is the 秘密 section now (Mac): no hidden unlock any more.
  // Bumped after 清除/恢复范例 so the 秘密 page reads the vault again.
  const [vaultRev, setVaultRev] = useState(0);
  // The 账号 page (Mac): which category the sidebar shows, a 新增 request for the page, and the type menu next to 新增.
  const [vaultCat, setVaultCat] = useState<EntryKind | "all">("all");
  const [vaultAdd, setVaultAdd] = useState<AddRequest | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const pendingLegacyOpen = useRef("");
  // Images and folders are shared by the sidebar, the list and Settings → 目录; nothing is read until one of them opens.
  const imageLibrary = useImageLibrary(deviceKey, imageView || settingsOpen, flashToast);
  // 选择 belongs to the folder it was started in: moving to another folder (or the 回收站) ends it.
  const imageSelecting = imageView && imageSelectKey === imageLibrary.filter && imageLibrary.filter !== IMAGE_FILTER_TRASH;
  const setImageSelecting = (next: boolean | ((value: boolean) => boolean)) => setImageSelectKey((key) => (typeof next === "function" ? next(key === imageLibrary.filter) : next) ? imageLibrary.filter : "\u0000");
  const [activeFolder, setActiveFolder] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  // Cards that just lost the selection keep their detail mounted while it folds away.
  const [closingIds, setClosingIds] = useState<string[]>([]);
  // The 收起 button in the list header folds the open card without moving the selection.
  const [collapsedAt, setCollapsedAt] = useState("");
  const [openId, setOpenIdState] = useState(() => { try { return localStorage.getItem(OPEN_CARD_KEY) || ""; } catch { return ""; } });
  function setOpenId(id: string) {
    setOpenIdState(id);
    try { if (id) localStorage.setItem(OPEN_CARD_KEY, id); else localStorage.removeItem(OPEN_CARD_KEY); } catch { /* the open card is only remembered for this session */ }
  }
  // Mini window: the one 话术 row opened in place, and the one folding away (kept mounted for its close animation).
  const [miniOpenId, setMiniOpenId] = useState("");
  const [miniClosingId, setMiniClosingId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SecretItem | null>(null);
  const { toastState, showToast, clearToast, pauseToast, resumeToast } = useToast();
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
  // The recent values stay in memory only: customer names must not sit in plain browser storage. Only the values the person pinned are kept.
  const [valueMemory, setValueMemory] = useState<ValueMemory>({});
  const lastValues = latestValues(valueMemory);
  const [pinnedValues, setPinnedValues] = useState<PinnedValues>(() => { try { return parsePinned(localStorage.getItem(PINNED_KEY)); } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedValues)); } catch { /* pins last for this session only */ } }, [pinnedValues]);
  const [valuesCollapsed, setValuesCollapsed] = useState(() => readStoredChoice(VALUES_COLLAPSED_KEY, ["0", "1"], "0") === "1");
  function toggleValuesCollapsed() { setValuesCollapsed((current) => { writeStoredChoice(VALUES_COLLAPSED_KEY, current ? "0" : "1"); return !current; }); }
  const [activeVar, setActiveVar] = useState<{ id: string; name: string } | null>(null);
  const [valueMenu, setValueMenu] = useState<{ name: string; value: string; x: number; y: number } | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  // 编辑 in the toast after a save: the entry to open once it is in the list shown.
  const pendingSavedEdit = useRef("");
  const [productFilter, setProductFilter] = useState("全部产品");
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [buildTime, setBuildTime] = useState("");
  const [windowMode, setWindowMode] = useState<WindowMode>("full");
  const secretReveal = useReveal();
  const hideSecret = secretReveal.hide;
  const [rowMenuId, setRowMenuId] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const spreadsheetFileRef = useRef<HTMLInputElement>(null);
  const folderCreateButtonRef = useRef<HTMLButtonElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const pendingEditorFocusRef = useRef<{ trigger: HTMLElement | null } | null>(null);
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const referenceFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef<SecretItem[]>([]);
  const foldersRef = useRef<FolderRegistry>(EMPTY_FOLDER_REGISTRY);
  const folderColorsRef = useRef<FolderColors | undefined>(undefined);
  const folderShortNamesRef = useRef<FolderShortNames | undefined>(undefined);
  const sharedSeenRef = useRef<string[] | undefined>(undefined);
  const nextSnippetNumberRef = useRef(1);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lazyWriterRef = useRef<LazyWriter | null>(null);
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
      folderShortNamesRef.current = data.folderShortNames;
      sharedSeenRef.current = data.sharedSeen;
      nextSnippetNumberRef.current = data.nextSnippetNumber;
      setItems(data.items);
      setFolders(data.folders);
      setFolderColors(data.folderColors);
      setFolderShortNames(data.folderShortNames);
      if (refreshContext) {
        // Windows has no second text section any more: an old context that points at it opens 话术.
        const restoredKind: ItemKind = refreshContext.activeKind;
        setActiveKind(restoredKind);
        setActiveFolder(resolveRefreshedActiveFolder(restoredKind, data.folders[restoredKind], restoredKind === refreshContext.activeKind ? refreshContext.activeFolder : "all"));
        setProductFilter(refreshContext.productFilter);
        setQuery(refreshContext.query);
        setImageView(refreshedImageView);
      }
      setLoading(false);
    }

    async function openVault() {
      // The TinyPNG keys and the 同步码, once, before anything reads them (D-057); never throws.
      await loadSecretSettings();
      const raw = localStorage.getItem(STORAGE_KEY);
      const secure = secureKeyStore();
      const knownKeys = await deviceKeyCandidates(localStorage, secure, DEVICE_KEY);
      if (!raw) {
        const nextDeviceKey = knownKeys[0] || createDeviceKey();
        const data: VaultData = synchronizeVaultData([], EMPTY_FOLDER_REGISTRY, 1);
        const envelope = await encryptVault(data, nextDeviceKey);
        // Written next to the data first, then moved (D-053), so a crash in between never loses it.
        localStorage.setItem(DEVICE_KEY, nextDeviceKey);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
        finishOpening(data, nextDeviceKey);
        void settleDeviceKey(nextDeviceKey, localStorage, secure, DEVICE_KEY);
        return;
      }
      if (knownKeys.length === 0) throw new Error("Local vault key is missing");
      try {
        const openedVault = await readLocalEncryptedVault();
        const opened = openedVault.data;
        finishOpening(opened, openedVault.deviceKey);
        void settleDeviceKey(openedVault.deviceKey, localStorage, secure, DEVICE_KEY);
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
    window.clipboxDesktop?.getBuildTime?.()
      .then((value) => { if (!cancelled) setBuildTime(value); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => window.clipboxDesktop?.onWindowMode?.((mode) => {
    setWindowMode(mode === "mini" ? "mini" : "full");
  }), []);

  // 账号 has no 目录 (owner, 2026-10-15): it is sorted by 分类 only. Old entries keep their stored folder, it is just not shown.
  const activeFolders = useMemo(() => (activeKind === "secret" ? NO_FOLDERS : folders[activeKind]), [activeKind, folders]);
  const categoryColors = useMemo(() => ({ ...buildCategoryColorMap(activeFolders), ...(folderColors?.[activeKind] || {}) }), [activeFolders, folderColors, activeKind]);
  const activeKindItems = useMemo(() => selectItemsByTrashState(items, activeKind, "active"), [items, activeKind]);
  const legacySecrets = useMemo(() => (PLAIN_NOTES ? NO_LEGACY_SECRETS : selectItemsByTrashState(items, "secret", "active").map((item) => ({ id: item.id, label: item.label, secret: item.secret, pinned: item.pinned, lastUsedAt: item.lastUsedAt }))), [items]);
  const accountMode = activeKind === "secret" && !imageView;
  // 账号页密码: asked every time the 账号 section is opened; leaving the section locks it again.
  const [lockSet, setLockSet] = useState(() => typeof window !== "undefined" && isAccountLockSet());
  const [accountUnlocked, setAccountUnlocked] = useState(false);
  const [lockModeNow, setLockModeNow] = useState<LockMode>(() => (typeof window === "undefined" ? "none" : lockMode()));
  // The key the 账号 stores are encrypted with: the device key without a password, otherwise the key the password opened (kept only in memory).
  const [accountSecret, setAccountSecret] = useState("");
  const accountKey = !lockSet ? deviceKey : accountUnlocked ? accountSecret : "";
  // 账号 header: 选择 (tick entries, 删除) and 收起 (fold every website card to its title).
  const [acctSelecting, setAcctSelecting] = useState(false);
  const [acctFolded, setAcctFolded] = useState(false);
  const accountLocked = lockSet && !(accountMode && accountUnlocked);
  const lockedHere = accountMode && lockSet && !accountUnlocked;
  // Read by the command line door when it asks for a 秘密 (a locked 账号 page refuses it at once).
  const accountLockedRef = useRef(accountLocked);
  accountLockedRef.current = accountLocked;
  const accountKeyRef = useRef(accountKey);
  accountKeyRef.current = accountKey;
  const automationConsent = useAutomationConsent();
  const askAutomationConsent = automationConsent.ask;
  // 账号 slide-to-unlock (D-051): frosted until slid open; closes again on leaving the section or when the window hides.
  // The 账号页密码 screen, when set, is the only gate. The mini window is left as it was.
  const [slideUnlockOn, setSlideUnlockOn] = useState(() => typeof window === "undefined" || readSlideUnlockOn());
  const [accountSlidOpen, setAccountSlidOpen] = useState(false);
  // Leaving the 账号 section locks it again (state adjusted while rendering, not in an effect).
  const [seenAccountMode, setSeenAccountMode] = useState(accountMode);
  if (seenAccountMode !== accountMode) {
    setSeenAccountMode(accountMode);
    if (!accountMode) { setAccountUnlocked(false); setAccountSecret(""); setAcctSelecting(false); setAccountSlidOpen(false); }
  }
  const accountVeiled = accountMode && windowMode === "full" && slideUnlockOn && !lockSet && !accountSlidOpen;
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") setAccountSlidOpen(false); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  // Windows has no old 秘密 list, so no 其他 category and no old 目录 under 分类.
  const categoryList = useMemo(() => (PLAIN_NOTES ? CATEGORY_ORDER.filter((id) => id !== "other" && id !== "apikey" && id !== "recovery") : CATEGORY_ORDER), []);
  const account = useAccountEntries(accountKey, legacySecrets, accountMode, vaultRev);
  const accountCounts = useMemo(() => ({ ...countByKind(account.entries), other: legacySecrets.length }), [account.entries, legacySecrets]);
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
  // Worked out once per list, not per row: with 1,000+ snippets the per-row search made every render slow.
  const cardMoves = useMemo(() => buildCardMoveMap(filtered), [filtered]);
  const folderCounts = useMemo(() => countItemsByFolder(activeKindItems), [activeKindItems]);
  // Opening an old entry from the 账号 list leads to the 「其他」 list with that entry selected.
  useEffect(() => {
    if (!pendingLegacyOpen.current || vaultCat !== "other") return;
    const index = filtered.findIndex((item) => item.id === pendingLegacyOpen.current);
    if (index < 0) return;
    pendingLegacyOpen.current = "";
    selectRow(index);
  });

  // The list starts folded. The card opened last stays open when the person comes back (openId); while searching,
  // the top result opens by itself so Enter still copies what is shown, until 收起 is pressed.
  const openIndex = openId ? filtered.findIndex((item) => item.id === openId) : -1;
  const safeSelected = openIndex >= 0 ? openIndex : Math.min(selected, Math.max(0, filtered.length - 1));
  const cardsCollapsed = collapsedAt === `${selected}|${activeFolder}|${activeKind}|${query}`;
  const expandedIndex = openIndex >= 0 ? openIndex : query.trim() !== "" && !cardsCollapsed && filtered.length > 0 ? safeSelected : -1;
  const selectedCardId = filtered[expandedIndex]?.id || "";
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
  // First-run guide: once, when the full window first shows after the data opened (never in the mini window).
  const guide = useFirstRunGuide(!loading && !startupError && windowMode === "full");
  const guideShown = guide.open && windowMode === "full";
  const auxiliaryDialogOpen = Boolean(snippetImport || deleteRequest || settingsOpen || guideShown);
  const inlineEditing = modalOpen || typingVariable || Boolean(newFolder) || Boolean(renamingFolder);
  const { homeShortcutsEnabled } = modalInteractionState(inlineEditing || auxiliaryDialogOpen, false, Boolean(backupMode));
  const backgroundInert = auxiliaryDialogOpen || Boolean(backupMode);
  const cardDragEnabled = activeFolder !== "trash" && canReorderCards(query, productFilter) && !backgroundInert;

  async function persistCardOrder(update: (items: SecretItem[]) => SecretItem[], successMessage = "顺序已更新", animate = false) {
    try {
      await persistLazy((current) => {
        if (animate) prepareSortAnimation("card");
        return { ...current, items: update(current.items) };
      });
      showToast(successMessage, { ms: 1800 });
    } catch {
      showToast("排序保存失败，原顺序已保留", { tone: "error", ms: 2400 });
    }
  }

  async function persistFolderOrder(update: (names: string[]) => string[], successMessage = "目录顺序已更新", animate = false) {
    try {
      await persistLazy((current) => {
        if (animate) prepareSortAnimation("folder");
        return { ...current, folders: { ...current.folders, [activeKind]: update(current.folders[activeKind]) } };
      });
      showToast(successMessage, { ms: 1800 });
    } catch {
      showToast("目录排序保存失败，原顺序已保留", { tone: "error", ms: 2400 });
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

  // Company 话术 library: new entries come in, untouched ones update, edited ones keep their text (see shared-library.ts).
  async function applySharedLibraryText(text: string): Promise<SyncSummary> {
    const { items: incoming, skipped } = parseSharedLibrary(text);
    let summary: SyncSummary | null = null;
    await persist((current) => {
      const result = syncSharedLibrary(current.items, incoming, skipped, { createId: () => crypto.randomUUID(), now: timestampNow(), seen: new Set(current.sharedSeen) });
      summary = result.summary;
      return { ...current, items: result.items, sharedSeen: result.seen };
    });
    const done = summary as SyncSummary | null;
    if (!done) throw new Error("同步没有成功，你的话术没有变化");
    writeSharedSummary(done);
    return done;
  }

  async function resolveShared(id: string, resolve: (item: SecretItem, now: number) => SecretItem) {
    await persist((current) => ({ ...current, items: current.items.map((item) => item.id === id ? resolve(item, timestampNow()) : item) }));
  }

  // On start and every 30 minutes while open, if a 同步码 is set: stay silent unless something changed, and never
  // complain when offline or when the code finds nothing (the next round tries again).
  // Without a 同步码, a build that ships the company's 话术 (D-066) adds and updates them once on start instead.
  useEffect(() => {
    if (loading) return;
    let running = false;
    const preset = presetLibraryText();
    if (preset && !readSharedUrl()) {
      void applySharedLibraryText(preset).then((summary) => {
        if (!summary.added && !summary.updated && !summary.keptMine && !summary.retired) return;
        showToast(`公司话术已装好：${describeSync(summary)}`, { ms: 3600 });
      }).catch(() => undefined);
    }
    const syncNow = () => {
      const source = readSharedUrl();
      if (!source || running) return;
      running = true;
      void fetchSharedLibraryText(source).then(applySharedLibraryText).then((summary) => {
        if (!summary.added && !summary.updated && !summary.keptMine && !summary.retired) return;
        showToast(`共享话术已同步：${describeSync(summary)}`, { ms: 3600 });
      }).catch(() => undefined).finally(() => { running = false; });
    };
    syncNow();
    const timer = window.setInterval(syncNow, SHARED_SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // 登录同步 (D-064): the cloud's 话术 and 账号 are merged in inside the same save queues as every other change.
  const cloudPlatform = typeof window === "undefined" ? undefined : window.clipboxDesktop?.platform;
  const cloudSync = useCloudSync({
    ready: !loading && Boolean(deviceKey),
    platform: cloudPlatform,
    changeSignal: items,
    onIncoming: (text) => showToast(text, { ms: 3600 }),
    mergers: {
      snippets: (remote, base) => enqueueVaultTask(async () => {
        const current = readVault();
        const merged = mergeSnippets({ items: current.items, folders: current.folders.snippet, sharedSeen: current.sharedSeen ?? [] }, remote, base);
        if (tooManyRemovals(merged.counts, current.items.filter(isSyncedSnippet).length)) throw new Error(CLOUD_TOO_MANY_REMOVALS);
        if (merged.changed) await writeVault({ ...current, items: merged.items, folders: { ...current.folders, snippet: merged.folders }, sharedSeen: merged.sharedSeen });
        return { cloud: merged.cloud, base: merged.base, counts: merged.counts };
      }),
      accounts: accountKey ? async (remote, base) => {
        const policy = syncPolicy(cloudPlatform);
        let result: ReturnType<typeof mergeAccounts> | null = null;
        try {
          await openSecretItemsStore(accountKey).update((current) => {
            result = mergeAccounts(current, remote, base, policy);
            if (tooManyRemovals(result.counts, current.length)) throw new Error(CLOUD_TOO_MANY_REMOVALS);
            if (!result.changed) throw CLOUD_NOTHING_TO_WRITE;
            return result.items;
          });
        } catch (error) { if (error !== CLOUD_NOTHING_TO_WRITE) throw error; }
        const done = result as ReturnType<typeof mergeAccounts> | null;
        if (!done) throw new Error("账号同步没有成功，内容没有变化");
        return { cloud: done.cloud, base: done.base, counts: done.counts };
      } : null,
    },
  });

  // 输入企业同步码 on the empty list: Settings opens on its home page, where the field sits; put the cursor in it.
  function openSyncCode() {
    setSettingsOpen(true);
    let tries = 0;
    const focus = () => {
      const field = document.getElementById("shared-url");
      if (field) field.focus();
      else if ((tries += 1) < 20) window.setTimeout(focus, 50);
    };
    window.setTimeout(focus, 50);
  }

  function exportSharedFile() {
    const blob = new Blob([exportSharedLibrary(itemsRef.current, timestampNow())], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `clipbox-company-library-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("已导出公司话术库文件");
  }

  async function refreshLocalVault() {
    if (refreshing) return;
    cancelCardDrag();
    cancelFolderDrag();
    setRefreshing(true);
    let relaunching = false;
    try {
      await lazyWriterRef.current?.flush();
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
        showToast("正在重新加载…", { ms: 0 });
        window.clipboxDesktop.relaunch();
        relaunching = true;
        return;
      }
      setDeviceKey(opened.deviceKey);
      itemsRef.current = opened.data.items;
      foldersRef.current = opened.data.folders;
      folderColorsRef.current = opened.data.folderColors;
      folderShortNamesRef.current = opened.data.folderShortNames;
      sharedSeenRef.current = opened.data.sharedSeen;
      nextSnippetNumberRef.current = opened.data.nextSnippetNumber;
      setItems(opened.data.items);
      setFolders(opened.data.folders);
      setFolderColors(opened.data.folderColors);
      setFolderShortNames(opened.data.folderShortNames);
      setActiveFolder(nextActiveFolder);
      showToast("已刷新", { ms: 1800 });
    } catch {
      localStorage.removeItem(REFRESH_CONTEXT_KEY);
      showToast("刷新失败，当前数据未改变", { tone: "error", ms: 2400 });
    } finally {
      if (!relaunching) setRefreshing(false);
    }
  }

  // For the image section and the 账号 panels, which pass only text: the tone follows the words (use-toast.ts).
  function flashToast(message: string, ms = 2200) {
    showToast(message, { ms });
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
  useDropdownDismiss(dropdownOpen, {
    all: () => { setProductMenuOpen(false); setRowMenuId(""); setBulkMoveOpen(false); setFolderMenu(""); setFolderDeleteArm(""); },
    rowAndBulk: () => { setRowMenuId(""); setBulkMoveOpen(false); },
    product: () => setProductMenuOpen(false),
  });
  useRowMenuPlacement(rowMenuId);

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
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [loading, inlineEditing, newFolder, auxiliaryDialogOpen, backupMode, bulkMode, homeShortcutsEnabled]);

  // The desktop shell's "focus the search" signal. Subscribed once (not again on every keystroke); it reads whether
  // shortcuts are allowed right now from a ref.
  const homeShortcutsRef = useRef(homeShortcutsEnabled);
  useEffect(() => { homeShortcutsRef.current = homeShortcutsEnabled; }, [homeShortcutsEnabled]);
  useEffect(() => {
    if (loading) return;
    const removeDesktopListener = window.clipboxDesktop?.onFocusSearch(() => {
      if (!homeShortcutsRef.current) return;
      setActiveFolder("all");
      setQuery("");
      window.setTimeout(() => searchRef.current?.focus(), 30);
    });
    return () => removeDesktopListener?.();
  }, [loading]);

  const readVault = useCallback((): VaultData => ({
    items: itemsRef.current,
    folders: foldersRef.current,
    nextSnippetNumber: nextSnippetNumberRef.current,
    folderColors: folderColorsRef.current,
    folderShortNames: folderShortNamesRef.current,
    sharedSeen: sharedSeenRef.current,
  }), []);

  // Both UI changes and external commands compute their update inside this queue.
  const enqueueVaultTask = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const queued = persistQueueRef.current.catch(() => undefined).then(task);
    persistQueueRef.current = queued.then(() => undefined, () => undefined);
    return queued;
  }, []);

  // The "storage is nearly full" warning shows once per app session.
  const storageWarnedRef = useRef(false);
  const storeVault = useCallback(async (data: VaultData) => {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as VaultEnvelope | null;
    const envelope = await encryptVault(data, deviceKey, current?.salt);
    // A backup restore may be replacing everything right now (write-gate.ts): then this old data must not be written.
    assertWritesOpen();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    if (!storageWarnedRef.current && isStorageNearlyFull(localStorage)) {
      storageWarnedRef.current = true;
      // After the save's own message (such as 条目已更新), so that one does not replace it at once.
      window.setTimeout(() => {
        showToast(STORAGE_NEARLY_FULL_MESSAGE, { tone: "error", ms: 3600 });
      }, 0);
    }
  }, [deviceKey, showToast]);

  const commitVaultToMemory = useCallback((data: VaultData) => {
    itemsRef.current = data.items;
    foldersRef.current = data.folders;
    folderColorsRef.current = data.folderColors;
    folderShortNamesRef.current = data.folderShortNames;
    sharedSeenRef.current = data.sharedSeen;
    nextSnippetNumberRef.current = data.nextSnippetNumber;
    setItems(data.items);
    setFolders(data.folders);
    setFolderColors(data.folderColors);
    setFolderShortNames(data.folderShortNames);
  }, []);

  // Saves at once. It writes everything currently in memory, so it also covers any lazy changes still waiting.
  const writeVault = useCallback(async (nextData: VaultData) => {
    const data = synchronizeVaultData(nextData.items, nextData.folders, nextData.nextSnippetNumber, nextData.folderColors, nextData.sharedSeen ?? sharedSeenRef.current, nextData.folderShortNames);
    await storeVault(data);
    commitVaultToMemory(data);
    lazyWriterRef.current?.cancel();
  }, [storeVault, commitVaultToMemory]);

  const persist = useCallback((update: (current: VaultData) => VaultData) => (
    enqueueVaultTask(() => writeVault(update(readVault())))
  ), [enqueueVaultTask, readVault, writeVault]);

  // For small, frequent changes (usage counts, pins, order): memory and screen update now, the disk write follows
  // one second after the last change. Quitting, hiding the window, sleep and reload save it first (flushLazyVault).
  const persistLazy = useCallback((update: (current: VaultData) => VaultData) => (
    enqueueVaultTask(async () => {
      const next = update(readVault());
      commitVaultToMemory(synchronizeVaultData(next.items, next.folders, next.nextSnippetNumber, next.folderColors, next.sharedSeen ?? sharedSeenRef.current, next.folderShortNames));
      lazyWriterRef.current?.markDirty();
    })
  ), [enqueueVaultTask, readVault, commitVaultToMemory]);

  useEffect(() => {
    if (loading || !deviceKey) return;
    const writer = createLazyWriter({
      write: () => enqueueVaultTask(() => storeVault(readVault())),
      onError: (error) => {
        // A backup restore is replacing everything and the page reloads next: nothing to tell.
        if (writesClosed()) return;
        showToast(isQuotaError(error) ? STORAGE_FULL_MESSAGE : "最近的改动保存失败，请再操作一次", { tone: "error", ms: 4800 });
      },
    });
    lazyWriterRef.current = writer;
    const flush = () => { void writer.flush(); };
    const flushWhenHidden = () => { if (document.hidden) flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    // Everything waiting is saved: queued edits, the delayed writer, the 账号 stores and pictures being written.
    const saveEverything = async () => {
      await persistQueueRef.current;
      await writer.flush();
      await persistQueueRef.current;
      await drainAll();
      await waitForImageWrites();
    };
    const removeFlushRequest = window.clipboxDesktop?.onFlushRequest?.(() => {
      // Immediate edits and queued lazy mutations must finish before we drain the lazy writer.
      void saveEverything().then(() => {
        if (!writer.hasPending()) window.clipboxDesktop?.flushDone?.();
      });
    });
    // Before a backup restore replaces the stored data, what is still waiting is saved (write-gate.ts).
    const removeQuiesce = onQuiesce(saveEverything);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      removeFlushRequest?.();
      removeQuiesce();
      void writer.flush();
      if (lazyWriterRef.current === writer) lazyWriterRef.current = null;
    };
  }, [loading, deviceKey, enqueueVaultTask, storeVault, readVault, showToast]);

  useEffect(() => {
    if (loading || !deviceKey || !window.clipboxDesktop?.onAutomationCommand) return;
    const remove = window.clipboxDesktop.onAutomationCommand(({ requestId, command, caller }) => {
      const execute = async () => {
        try {
          const secretExport = parseSecretExportCommand(command);
          if (secretExport) {
            const currentData = {
              items: itemsRef.current,
              folders: foldersRef.current,
              nextSnippetNumber: nextSnippetNumberRef.current,
              folderColors: folderColorsRef.current,
              folderShortNames: folderShortNamesRef.current,
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
            showToast(`${SECRET_WORD}加密备份已生成`);
            return;
          }
          if (isApiKeySecretCommand(command)) {
            if (!accountKeyRef.current) throw new AutomationCommandError("ACCOUNT_LOCKED", "账号已上锁，请先在 Copyboxx 里打开账号页并解锁");
            const result = runApiKeySecretCommand(await openSecretItemsStore(accountKeyRef.current).list(), command);
            window.clipboxDesktop?.respondAutomationCommand(requestId, { ok: true, ...result });
            return;
          }
          const committed = await commitSnippetAutomationCommand(
            {
              items: itemsRef.current,
              folders: foldersRef.current,
              nextSnippetNumber: nextSnippetNumberRef.current,
              folderColors: folderColorsRef.current,
              folderShortNames: folderShortNamesRef.current,
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
            showToast(`外部任务${verb} ${number}`);
          }
        } catch (error) {
          const code = error instanceof AutomationCommandError ? error.code : "PERSIST_FAILED";
          const message = error instanceof Error ? error.message : "外部命令执行失败";
          window.clipboxDesktop?.respondAutomationCommand(requestId, { ok: false, error: { code, message } });
          showToast("外部修改失败", { tone: "error", ms: 2400 });
        }
      };
      const secretAction = secretAutomationAction(command);
      if (!secretAction) {
        void enqueueVaultTask(execute);
        return;
      }
      // A 秘密 only leaves the app after the person here says yes; the question waits outside the save queue.
      void (async () => {
        const asker = parseAutomationCaller(caller);
        const answer = accountLockedRef.current ? "denied" : await askAutomationConsent(secretAction, asker);
        const allowed = answer !== "denied";
        // Allowed without a question (「始终允许」, D-059): say so, so it never happens unseen.
        if (allowed && answer === "remembered" && asker && !accountLockedRef.current) showToast(`已自动允许「${asker.name}」读取秘密`);
        const refusal = secretGateRefusal({ accountLocked: accountLockedRef.current, allowed });
        if (refusal) {
          window.clipboxDesktop?.respondAutomationCommand(requestId, { ok: false, error: refusal });
          return;
        }
        void enqueueVaultTask(execute);
      })();
    });
    window.clipboxDesktop.automationReady();
    return remove;
  }, [deviceKey, enqueueVaultTask, loading, writeVault, showToast, askAutomationConsent]);

  async function finishCopy(item: SecretItem, copied: string) {
    await copyTextWithExpiry(copied);
    void persistLazy((current) => ({ ...current, items: current.items.map((value) => value.id === item.id ? recordCopy(value, timestampNow()) : value) })).catch(() => showToast("已复制，但使用记录保存失败", { tone: "error" }));
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
    showToast("引用已复制，可直接发给其他任务");
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
    const readiness = snippetCopyReadiness(item, state.values, state.language);
    if (!readiness.ready) {
      const index = filtered.findIndex((value) => value.id === item.id);
      if (index >= 0 && index !== expandedIndex) selectRow(index);
      const missing = readiness.missingPlaceholders;
      showToast(`先填写：${missing.join("、")}`, { tone: "ok" });
      window.setTimeout(() => {
        const row = document.querySelector(`[data-sort-id="${CSS.escape(item.id)}"]`);
        Array.from(row?.querySelectorAll<HTMLInputElement>("input[data-var]") || []).find((input) => !input.value.trim())?.focus();
      }, 60);
      return;
    }
    // Values carried over from an earlier copy are shown first: the person must see them once before they go out.
    const unseen = state.remembered.filter((name) => name !== pickedName && extractPlaceholders(source).includes(name));
    if (unseen.length > 0) {
      const index = filtered.findIndex((value) => value.id === item.id);
      if (index >= 0 && index !== expandedIndex) selectRow(index);
      setFill({ ...state, values: state.values, remembered: [] });
      showToast(`带入了上次的${unseen.map((name) => `${name}（${state.values[name]}）`).join("、")}，确认没错再复制一次`, { tone: "ok", ms: 3600 });
      return;
    }
    await finishCopy(item, fillSnippetTemplate(source, state.values).text);
    setValueMemory((current) => rememberValues(current, state.values, pinnedValues));
  }

  // Right-click on a block (or on one of its remembered values) pins the value: a pinned value is not pushed out by new ones.
  function pinValue(item: SecretItem, name: string, value = fillFor(item).values[name] || "") {
    const outcome = togglePin(valueMemory, pinnedValues, name, value);
    if (outcome.result === "empty") { showToast("先填一个值，再右键固定", { ms: 2400 }); }
    else if (outcome.result === "full") { showToast(`${name} 已固定 3 个，先取消一个再固定`, { tone: "ok", ms: 2400 }); }
    else { setValueMemory(outcome.memory); setPinnedValues(outcome.pins); showToast(outcome.result === "pinned" ? `已固定「${value.trim()}」，不会被新值顶掉` : `已取消固定「${value.trim()}」`, { ms: 2400 }); }
  }
  // Delete a remembered value everywhere; the menu on a listed value calls this.
  function removeValue(name: string, value: string) {
    const outcome = deleteValue(valueMemory, pinnedValues, name, value);
    setValueMemory(outcome.memory);
    setPinnedValues(outcome.pins);
    showToast(`已删除「${value}」`, { ms: 2000 });
  }
  const { startOptionDrag } = useValueOptionDrag(valueMemory, pinnedValues, setValueMemory, setPinnedValues);
  // The menu on a value's handle moves it one place; pinned values only change places among themselves.
  function stepOption(name: string, value: string, step: -1 | 1) {
    const options = memoryOptions(valueMemory, pinnedValues, name);
    const target = options[options.indexOf(value) + step];
    if (target === undefined) return;
    const outcome = moveOption(valueMemory, pinnedValues, name, value, target);
    if (outcome.memory !== valueMemory || outcome.pins !== pinnedValues) { setValueMemory(outcome.memory); setPinnedValues(outcome.pins); }
  }
  function canStepOption(name: string, value: string, step: -1 | 1) {
    const options = memoryOptions(valueMemory, pinnedValues, name);
    const target = options[options.indexOf(value) + step];
    return target !== undefined && isPinned(pinnedValues, name, value) === isPinned(pinnedValues, name, target);
  }
  // Variable blocks, checks, or a 中文翻译 all mean the card offers the 英文/中文 switch and prepares the copy.
  function hasPreparedCopy(item: SecretItem) {
    return hasOptionalSnippetPreparation(item) || Boolean(item.snippetMeta?.chineseText?.trim());
  }

  function variableNames(item: SecretItem) {
    return [...new Set([...item.secret.matchAll(/\[([^[\]\n]+)\]/g)].map((match) => match[1].trim()))];
  }

  function showVariableHelp() {
    showToast("最多记 3 个值，右键固定，固定的不会被新值顶掉", { ms: 4200 });
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
    if (item.kind === "snippet" && hasPreparedCopy(item)) { await copyPrepared(item); return; }
    await copyRaw(item, language);
  }

  // Copies the text as written (notes, accounts, 话术 without highlighted blocks).
  async function copyRaw(item: SecretItem, language: CopyLanguage = "en") {
    const source = resolveSnippetCopySource(item, language);
    if (!source) return;
    await finishCopy(item, source);
  }

  // The mini window has no place to fill highlighted blocks: an unfilled block goes out as its pinned value, its default
  // or its own word (owner, 2026-10-14), never as 「[Name]」 with brackets, and a short message says what was used.
  async function copyMini(item: SecretItem) {
    const source = resolveSnippetCopySource(item, "en");
    const names = item.kind === "snippet" ? extractPlaceholders(source) : [];
    if (!source || names.length === 0) { await copyRaw(item); return; }
    // What was typed in the main window is not reused: it cannot be seen here and is often the last customer's name.
    const { values, used } = quickFillValues(names, {}, pinnedValues);
    await finishCopy(item, fillSnippetTemplate(source, values).text);
    // Short enough for the 360px window: one block is named, several are counted.
    if (used.length === 1) showToast(`已复制，${used[0].name} 用了「${used[0].value.length > 12 ? `${used[0].value.slice(0, 12)}…` : used[0].value}」`, { ms: 2600 });
    else if (used.length > 1) showToast(`已复制，${used.length} 处没填，用了默认值`, { ms: 2600 });
  }

  // Mini window: a click on a 话术 row opens it in place (one at a time); a second click closes it.
  function toggleMiniRow(item: SecretItem, index: number) {
    setSelected(index);
    const leaving = miniOpenId;
    setMiniOpenId(leaving === item.id ? "" : item.id);
    if (!leaving) return;
    setMiniClosingId(leaving);
    window.setTimeout(() => setMiniClosingId((id) => id === leaving ? "" : id), DETAIL_CLOSE_MS + 40);
  }

  function handleSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (imageView) {
      if (event.key === "Escape") { setQuery(""); searchRef.current?.blur(); }
      return;
    }
    if (lockedHere) return;
    if (accountVeiled && event.key === "Enter") return;
    if (event.key === "ArrowDown") { event.preventDefault(); moveSelection((value) => Math.min(Math.max(0, filtered.length - 1), value + 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); moveSelection((value) => Math.max(0, value - 1)); }
    if (event.key === "Enter" && activeFolder !== "trash" && !(accountMode && activeFolder === "all" && vaultCat !== "other") && filtered[safeSelected]) { event.preventDefault(); void (windowMode === "mini" ? copyMini : copy)(filtered[safeSelected]); }
    if (event.key === "Escape") { setQuery(""); searchRef.current?.blur(); }
  }

  // The toast after a save offers 编辑 (open this entry again) and 撤销 (put it back as it was before this save).
  async function saveItem(data: Omit<SecretItem, "id" | "createdAt" | "updatedAt">) {
    const now = timestampNow();
    const wasEditing = Boolean(editing);
    const id = editing ? editing.id : crypto.randomUUID();
    let before = null as SecretItem | null;
    let nextBefore = 0;
    await persist((current) => {
      nextBefore = current.nextSnippetNumber;
      before = editing ? current.items.find((item) => item.id === id) ?? null : null;
      return editing
        ? { ...current, items: current.items.map((item) => item.id === id ? { ...item, ...data, updatedAt: now } : item) }
        : { ...current, items: [{ ...data, id, createdAt: now, updatedAt: now }, ...current.items] };
    });
    closeEditor();
    const after = itemsRef.current.find((item) => item.id === id);
    const record: ItemSaveRecord | null = after && (before || !wasEditing) ? { before, after, nextBefore, nextAfter: nextSnippetNumberRef.current } : null;
    showToast(wasEditing ? "条目已更新" : "条目已加密保存", record ? {
      ms: 5000,
      actions: [
        { label: "编辑", variant: "primary", onClick: () => editSavedItem(id) },
        { label: "撤销", variant: "secondary", onClick: () => void undoSave(record) },
      ],
    } : undefined);
  }

  // 撤销 in the save toast. It refuses when the entry changed again after the save, so nothing newer is lost.
  async function undoSave(record: ItemSaveRecord) {
    clearToast();
    let refused = false as boolean;
    try {
      await persist((current) => {
        const undone = undoItemSave(current, record);
        if (!undone) { refused = true; return current; }
        return undone;
      });
    } catch {
      showToast("撤销失败，内容保持现在的样子", { tone: "error", ms: 2800 });
      return;
    }
    if (refused) { showToast("这条保存后又改过，没有撤销", { tone: "error", ms: 2800 }); return; }
    if (modalOpen && editing?.id === record.after.id) closeEditor();
    showToast("已撤销", { ms: 1800 });
  }

  // 编辑 in the save toast: the same inline editor as a card's 编辑 button. When the entry is not in the list shown
  // (another section, folder or search), the list switches to where it is first.
  function editSavedItem(id: string) {
    clearToast();
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item || isTrashedItem(item)) { showToast("这条已经不在了", { tone: "error" }); return; }
    const kind = item.kind || "secret";
    if (imageView || kind !== activeKind) switchKind(kind);
    else if (!filtered.some((entry) => entry.id === id)) { selectFolder("all"); setQuery(""); }
    if (kind === "secret" && accountMode) setVaultCat("other");
    pendingSavedEdit.current = id;
  }

  useEffect(() => {
    const id = pendingSavedEdit.current;
    if (!id) return;
    const index = filtered.findIndex((item) => item.id === id);
    if (index < 0) return;
    pendingSavedEdit.current = "";
    selectRow(index);
    openEditor(filtered[index]);
    window.requestAnimationFrame(() => document.querySelector(".native-row.editing")?.scrollIntoView({ block: "nearest" }));
  });

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
      showToast(result.created ? "目录已创建" : "目录已存在，已打开");
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
    showToast(failure || success, failure ? { tone: "error", ms: 2800 } : { tone: "ok", ms: 2000 });
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

  // Short name on the mini window's folder tab (D-049). "" or null goes back to the first two characters.
  async function settingsFolderShortName(kind: SettingsFolderKind, folder: string, shortName: string | null) {
    if (kind === "image") return imageFolderTask((onError) => imageLibrary.setFolderShortName(folder, shortName, onError));
    return commitFolderChange((data) => setFolderShortName(data, kind, folder, shortName), shortName?.trim() ? "简称已保存" : "已恢复默认简称");
  }

  function settingsFolderMove(kind: SettingsFolderKind, folder: string, delta: -1 | 1) {
    if (kind === "image") {
      const names = imageLibrary.folders.map((entry) => entry.name);
      const neighbour = names[names.indexOf(folder) + delta];
      if (neighbour) void imageLibrary.reorderFolder(folder, neighbour);
      return;
    }
    void commitFolderChange((data) => ({ data: { ...data, folders: { ...data.folders, [kind]: moveName(data.folders[kind], folder, delta) } } }), "目录顺序已更新");
  }

  function settingsFolderReorder(kind: SettingsFolderKind, source: string, target: string) {
    if (kind === "image") { void imageLibrary.reorderFolder(source, target); return; }
    void commitFolderChange((data) => ({ data: { ...data, folders: { ...data.folders, [kind]: reorderNames(data.folders[kind], source, target) } } }), "目录顺序已更新");
  }

  function buildSettingsFolderGroups(): SettingsFolderGroup[] {
    const textGroups = (["snippet"] as const).map((kind): SettingsFolderGroup => {
      const colors = { ...buildCategoryColorMap(folders[kind]), ...(folderColors?.[kind] || {}) };
      return {
        kind,
        title: "话术目录",
        unit: "条",
        nameMax: 30,
        sortable: true,
        autoColor: true,
        folders: folders[kind].map((name) => ({
          name,
          count: items.filter((item) => !isTrashedItem(item) && (item.kind || "secret") === kind && item.folder === name).length,
          color: colors[name] || UNCATEGORIZED_COLOR,
          locked: Boolean(folderEditBlocker(kind, name)),
          shortName: folderShortNames?.[kind]?.[name] || "",
          defaultShortName: folderShortName(name),
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
      sortable: true,
      autoColor: false,
      folders: imageLibrary.folders.map(({ name, shortName }) => ({ name, count: imageCountsByFolder[name] ?? 0, color: imageColors[name] || UNCATEGORIZED_COLOR, locked: false, shortName: shortName || "", defaultShortName: folderShortName(name) })),
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
      showToast("移入回收站失败，条目保持原位", { tone: "error", ms: 2400 });
      return;
    }
    setSelected(0);
    hideSecret();
    showToast(list.length > 1 ? `已移入回收站 ${list.length} 条` : "已移入回收站", { tone: "ok", ms: 6000, actions: [{ label: "撤销", onClick: () => void undoTrashNow(list) }] });
  }

  async function undoTrashNow(list: SecretItem[]) {
    clearToast();
    try {
      await persist((current) => ({ ...current, items: restoreTrashedItems(current.items, list.map((item) => item.id)) }));
      setSelected(0);
      showToast(list.length > 1 ? `已恢复 ${list.length} 条` : "已恢复到原目录");
    } catch {
      showToast("恢复失败，内容仍保留在回收站", { tone: "error" });
    }
  }

  // A picture went to the 回收站: the same 6-second 撤销 as for 话术.
  function offerImageUndo(meta: ImageMeta) {
    showToast("图片已移入回收站", { tone: "ok", ms: 6000, actions: [{ label: "撤销", onClick: () => void undoImageTrash(meta) }] });
  }

  async function undoImageTrash(meta: ImageMeta) {
    clearToast();
    if (await imageLibrary.restore(meta.id)) flashToast("已恢复");
  }

  function exitBulk() {
    setBulkMode(false);
    setBulkIds([]);
    setBulkMoveOpen(false);
  }

  function toggleBulk(id: string) {
    setBulkMode(true);
    setRowMenuId("");
    hideSecret();
    setBulkIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function bulkMoveTo(folder: string) {
    const ids = bulkIds.filter((id) => filtered.some((item) => item.id === id));
    setBulkMoveOpen(false);
    if (ids.length === 0) return;
    try {
      await persist((current) => ({ ...current, items: moveItemsToFolder(current.items, ids, folder, timestampNow()) }));
      showToast(folder ? `已把 ${ids.length} 条移到「${folder}」` : `已把 ${ids.length} 条移到未分类`);
    } catch {
      showToast("移动失败，条目保持原位", { tone: "error" });
    }
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
    showToast(deleteRequest.permanent ? "已永久删除" : "已移入回收站");
  }

  // The mini window stays after a copy unless the person picks otherwise (owner, 2026-10-13: it vanished after a copy on Windows).
  const [miniHidePolicy, setMiniHidePolicy] = useState<MiniHidePolicy>(() => readStoredChoice<MiniHidePolicy>(MINI_HIDE_KEY, ["hotkey", "always", "never"], "never"));
  const [trashDays, setTrashDays] = useState<number>(() => readStoredChoice<number>(TRASH_DAYS_KEY, TRASH_DAY_OPTIONS, DEFAULT_TRASH_DAYS));
  useAutoBackup(!loading && !startupError);
  useEffect(() => {
    window.clipboxDesktop?.setMiniHidePolicy?.(miniHidePolicy);
    // Only tell the desktop shell about the stored choice once on start; later changes go through chooseMiniHidePolicy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pinOnTop, setPinOnTop] = useState(() => readStoredChoice(PIN_ON_TOP_KEY, ["1"], "") === "1");
  useEffect(() => {
    window.clipboxDesktop?.setPinned?.(pinOnTop);
    // Sent once on start; later changes go through togglePinOnTop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePinOnTop() {
    const next = !pinOnTop;
    setPinOnTop(next);
    try { if (next) localStorage.setItem(PIN_ON_TOP_KEY, "1"); else localStorage.removeItem(PIN_ON_TOP_KEY); } catch { /* keep the in-memory choice for this session */ }
    window.clipboxDesktop?.setPinned?.(next);
  }

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
      .catch(() => showToast("自动清理回收站失败，内容已保留", { tone: "error", ms: 2800 }));
  }, [loading, trashDays, items, persist, showToast]);

  // Pictures that have sat in the 回收站 longer than the chosen retention are removed for good (same setting as 话术).
  // Runs once the 图片 section has been read (nothing is opened before that).
  const { ready: imagesReady, purgeExpired: purgeExpiredImages, trashed: trashedImagesList } = imageLibrary;
  useEffect(() => {
    if (!imagesReady || trashDays === 0 || trashedImagesList.length === 0) return;
    void purgeExpiredImages(trashDays);
  }, [imagesReady, trashDays, trashedImagesList, purgeExpiredImages]);

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
      showToast("无法打开数据文件夹", { tone: "error" });
    }
  }

  async function emptyTrash() {
    const count = items.filter((item) => isTrashedItem(item)).length;
    clearToast();
    try {
      // Nothing is changed in memory until the encrypted save succeeded (writeVault), so a failure leaves the trash as it was.
      await persist((current) => ({ ...current, items: current.items.filter((item) => !isTrashedItem(item)) }));
    } catch (error) {
      showToast(isQuotaError(error) ? STORAGE_FULL_MESSAGE : "清空失败，回收站没有变化", { tone: "error", ms: 3600 });
      return;
    }
    showToast(`已永久删除 ${count} 条`);
  }

  async function restoreItem(item: SecretItem) {
    try {
      await persist((current) => ({ ...current, items: restoreTrashedItem(current.items, item.id) }));
      setSelected(0);
      showToast("已恢复到原目录");
    } catch {
      showToast("恢复失败，内容仍保留在回收站", { tone: "error", ms: 2400 });
    }
  }

  function togglePinned(item: SecretItem) {
    void persistLazy((current) => {
      prepareSortAnimation("card"); // starred cards sort first: slide the cards to their new places
      return { ...current, items: current.items.map((value) => value.id === item.id ? { ...value, pinned: !value.pinned } : value) };
    }).catch(() => showToast("收藏保存失败，请重试", { tone: "error", ms: 2400 }));
  }

  function showImages() {
    if (imageView) return;
    setImageView(true);
    setQuery("");
    setSearchAllFolders(false);
    setSelected(0);
    setRowMenuId("");
    hideSecret();
    setFolderMenu("");
    setRenamingFolder(null);
    setNewFolder(null);
    exitBulk();
    if (modalOpen) closeEditor();
    setFill(null);
  }

  // From 使用排行: close Settings and find that snippet in the list.
  function showItemInList(item: SecretItem) {
    setSettingsOpen(false);
    setImageView(false);
    setActiveKind("snippet");
    setActiveFolder("all");
    setProductFilter("全部产品");
    setSearchAllFolders(true);
    setQuery(item.label);
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
    hideSecret();
    setFolderMenu("");
    setRenamingFolder(null);
    setNewFolder(null);
    exitBulk();
    if (modalOpen) closeEditor();
    setFill(null);
  }

  function openLegacyEntry(id: string) {
    pendingLegacyOpen.current = id;
    selectFolder("all");
    setQuery("");
    setVaultCat("other");
  }

  // 新增 on the 账号 page: in 「全部」 it asks for the type first; inside a category it creates that type directly.
  function addAccount(tab: EntryKind) {
    setAddMenuOpen(false);
    if (activeFolder !== "all") selectFolder("all");
    if (tab === "other") { setVaultCat("other"); openEditor(null); return; }
    setVaultAdd((current) => ({ tab, n: (current?.n ?? 0) + 1 }));
  }

  function selectFolder(folder: string) {
    setActiveFolder(folder);
    if (folder === "trash") setProductFilter("全部产品");
    setSelected(0);
    setRowMenuId("");
    hideSecret();
    setFolderMenu("");
    exitBulk();
    setFill(null);
  }

  // Rows slide to their new places when a different entry opens.
  function moveSelection(update: (value: number) => number) {
    const next = update(safeSelected);
    const nextId = filtered[next]?.id || "";
    const leaving = bulkMode ? undefined : selectedCardId;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (leaving && !reduceMotion && nextId !== leaving) {
      setClosingIds((ids) => ids.includes(leaving) ? ids : [...ids, leaving]);
      window.setTimeout(() => setClosingIds((ids) => ids.filter((id) => id !== leaving)), DETAIL_CLOSE_MS + 40);
    }
    setSelected(next);
    setCollapsedAt("");
    if (nextId && !bulkMode) setOpenId(nextId);
  }

  function selectRow(index: number) {
    if (fill && filtered[index]?.id !== fill.itemId) setFill(null);
    moveSelection(() => index);
    setRowMenuId("");
    hideSecret();
  }

  function collapseCards() {
    const leaving = selectedCardId;
    if (!leaving || bulkMode) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setClosingIds((ids) => ids.includes(leaving) ? ids : [...ids, leaving]);
      window.setTimeout(() => setClosingIds((ids) => ids.filter((id) => id !== leaving)), DETAIL_CLOSE_MS + 40);
    }
    setCollapsedAt(`${selected}|${activeFolder}|${activeKind}|${query}`);
    setOpenId("");
    setRowMenuId("");
    hideSecret();
  }

  function requestWindowMode(mode: WindowMode) {
    setWindowMode(mode);
    setMenuOpen(false);
    setProductMenuOpen(false);
    setRowMenuId("");
    hideSecret();
    if (mode === "mini" && activeFolder === "trash") setActiveFolder("all");
    window.clipboxDesktop?.setWindowMode?.(mode);
    window.setTimeout(() => searchRef.current?.focus(), 60);
  }

  async function moveItemToFolder(item: SecretItem, folder: string) {
    setRowMenuId("");
    try {
      await persist((current) => ({ ...current, items: current.items.map((value) => value.id === item.id ? { ...value, folder, updatedAt: timestampNow() } : value) }));
      showToast(folder ? `已移动到「${folder}」` : "已移到未分类", { ms: 2000 });
    } catch {
      showToast("移动失败，条目保持原位", { tone: "error", ms: 2400 });
    }
  }

  useEffect(() => {
    document.querySelector(`[data-row-index="${safeSelected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [safeSelected, windowMode, activeFolder, activeKind]);

  async function exportVault(password: string, scope: BackupScope) {
    const currentData = { items: itemsRef.current, folders: foldersRef.current, nextSnippetNumber: nextSnippetNumberRef.current, folderColors: folderColorsRef.current, folderShortNames: folderShortNamesRef.current, sharedSeen: sharedSeenRef.current };
    const scopedData = vaultDataForBackupScope(currentData, scope);
    const envelope = await encryptVault(scopedData, password);
    let vaultBox: VaultBoxEnvelope | undefined;
    if (scope === "secret") {
      try {
        const payload: VaultBoxPayload = { totp: await openTotpStore(accountKey).list(), items: await openSecretItemsStore(accountKey).list() };
        if (!isVaultBoxEmpty(payload)) vaultBox = await encryptVaultBox(payload, password);
      } catch {
        showToast("账号里的内容读不出来，备份没有生成，数据没有改动", { tone: "error", ms: 5000 });
        return;
      }
    }
    const backup: SecureBackup = { format: "clipbox-secure-backup", version: 3, scope, createdAt: Date.now(), envelope, ...(vaultBox ? { vaultBox } : {}) };
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const fileWord = scope === "snippet" ? "snippets" : "secrets";
    anchor.download = `clipbox-${fileWord}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupMode(null);
    if (scope === "secret") {
      showToast(`${SECRET_WORD}备份已导出`);
      return;
    }
    try { localStorage.setItem(LAST_BACKUP_KEY, String(Date.now())); } catch { /* optional hint only */ }
    setLastBackupAt(Date.now());
    showToast("话术备份已导出");
  }

  async function importVault(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as SecureBackup | LegacyDeviceBackup | VaultEnvelope;
      if ("format" in parsed && parsed.format === "clipbox-secure-backup") {
        if (!parsed.envelope?.ciphertext || !parsed.envelope?.salt || !isSaneIterationCount(parsed.envelope.iterations)) throw new Error();
        if (parsed.version === 3) {
          if (parsed.scope !== "snippet" && parsed.scope !== "secret") throw new Error();
          setPendingImport({ envelope: parsed.envelope, scope: parsed.scope, ...(looksLikeVaultBox(parsed.vaultBox) ? { vaultBox: parsed.vaultBox } : {}) });
        } else if (parsed.version === 2) {
          setPendingImport({ envelope: parsed.envelope });
        } else {
          throw new Error();
        }
      } else if ("format" in parsed && parsed.format === "clipbox-device-backup") {
        if (!isSaneIterationCount(parsed.envelope?.iterations)) throw new Error();
        const opened = await decryptVault(parsed.envelope, parsed.deviceKey);
        setPendingImport({ legacyData: opened });
      } else {
        const envelope = parsed as VaultEnvelope;
        if (envelope.version !== 1 || !envelope.ciphertext || !envelope.salt || !isSaneIterationCount(envelope.iterations)) throw new Error();
        setPendingImport({ envelope });
      }
      setBackupMode("import");
      setMenuOpen(false);
    } catch {
      showToast("这不是有效的 Copyboxx 加密备份", { tone: "error", ms: 3600 });
    }
  }

  async function applyImport(password: string, strategy: ImportStrategy) {
    if (!pendingImport) return;
    const importedData = pendingImport.legacyData || await decryptVault(pendingImport.envelope as VaultEnvelope, password);
    // Opened before anything is written, so a bad block cannot leave a half-restored backup.
    const importedBox = pendingImport.vaultBox ? await decryptVaultBox(pendingImport.vaultBox, password) : null;
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
    // 账号 locked: its part of the backup waits; the closing message says so (it would replace a separate one).
    const boxSkipped = Boolean(importedBox && !accountKey);
    if (importedBox && !boxSkipped) {
      const totpStore = openTotpStore(accountKey);
      const itemStore = openSecretItemsStore(accountKey);
      const merged = mergeVaultBox({ totp: await totpStore.list(), items: await itemStore.list() }, importedBox, strategy);
      await totpStore.replaceAll(merged.totp);
      await itemStore.replaceAll(merged.items);
      setVaultRev((n) => n + 1);
    }
    setPendingImport(null);
    setBackupMode(null);
    const done = strategy === "replace" ? `已恢复 ${result.importedCount} 条内容` : `已安全导入 ${result.importedCount} 条内容`;
    if (boxSkipped) showToast(`${done}。账号页已上锁，备份里的账号内容没有导入。先打开账号页、输入密码，再导入一次`, { tone: "error", ms: 7000 });
    else showToast(done, { ms: 2400 });
  }

  async function prepareSnippetImport(file: File) {
    try {
      const rows = await parseSnippetWorkbook(await file.arrayBuffer(), file.name);
      const preview = buildSnippetImportPreview(rows, itemsRef.current, () => crypto.randomUUID(), timestampNow());
      setSnippetImport(preview);
      setSnippetImportName(file.name);
      setMenuOpen(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "无法读取这份话术表格", { tone: "error", ms: 4000 });
    }
  }

  async function applySnippetImport() {
    if (!snippetImport || snippetImport.importableCount === 0) return;
    try {
      // As with every immediate save, memory changes only after the encrypted write succeeded.
      await persist((current) => ({
        ...current,
        items: [...snippetImport.items, ...current.items],
        folders: { secret: current.folders.secret, snippet: Array.from(new Set([...current.folders.snippet, ...snippetImport.folders])) },
      }));
    } catch (error) {
      // The dialog stays open, so the person can try again or cancel.
      showToast(isQuotaError(error) ? STORAGE_FULL_MESSAGE : "导入没有成功，原来的内容没有改动", { tone: "error", ms: 4000 });
      return;
    }
    const importedCount = snippetImport.importableCount;
    setSnippetImport(null);
    setSnippetImportName("");
    setImageView(false);
    setActiveKind("snippet");
    setActiveFolder("all");
    setProductFilter("全部产品");
    setQuery("");
    setSelected(0);
    showToast(`已导入 ${importedCount} 条话术`, { ms: 2600 });
  }

  if (startupError) return <main className="loading-page startup-error"><VaultMark /><strong>Copyboxx 无法打开数据</strong><span>{startupError}</span><button onClick={() => window.location.reload()}>重试</button></main>;
  if (loading) return <main className="loading-page"><VaultMark /><span>正在打开 Copyboxx…</span></main>;

  const isMini = windowMode === "mini";
  const sectionTitle = imageView ? imageFilterTitle(imageLibrary.filter) : activeFolder === "all"
    ? (activeKind === "snippet" ? "全部话术" : vaultCat !== "all" ? CATEGORY_LABEL[vaultCat] : `全部${SECRET_WORD}`)
    : activeFolder === "pinned" ? "收藏"
      : activeFolder === "recent" ? "最近使用"
      : activeFolder === "trash" ? "回收站"
        : activeFolder === "uncategorized" ? "未分类"
          : activeFolder.slice(7);
  const searchPlaceholder = imageView ? "搜索图片标题" : accountMode && ["all", "pinned", "recent"].includes(activeFolder) ? "搜索名称、网站、用户名" : activeFolder === "trash" ? "搜索回收站" : activeKind === "secret" ? `搜索${SECRET_WORD}标题` : englishSearch ? "搜索英文单词" : "搜索标题、编号或内容";
  // Mac: the 秘密 section IS the 保险箱 (its folders such as 回收站 still show the old list).
  // In 全部, 收藏 and 最近使用 the new entry's type is asked first; inside one category it is known.
  const addAsksType = vaultCat === "all" || activeFolder !== "all";
  const vaultPage = accountMode && ["all", "pinned", "recent", "trash"].includes(activeFolder);
  const kindSwitch = (
    <ArcSegmented
      className={`kind-switch ${isMini ? "compact" : ""}`}
      label="内容板块"
      value={imageView ? "image" : activeKind}
      onSelect={(next) => { if (next === "image") showImages(); else switchKind(next as ItemKind); }}
      // Order fixed by the owner (2026-10-13): 话术 | 图片 | 账号.
      options={[
        { value: "snippet", label: "话术" },
        { value: "image", label: "图片" },
        { value: "secret", label: SECRET_WORD },
      ]}
    />
  );
  // Top row: 全部 / 收藏 / 最近. Row under the search box: the folders.
  const miniTopTabs: MiniTab[] = imageView
    ? [{ id: IMAGE_FILTER_ALL, label: "全部" }, { id: IMAGE_FILTER_PINNED, label: "收藏" }, { id: IMAGE_FILTER_RECENT, label: "最近" }]
    : [{ id: "all", label: "全部" }, { id: "pinned", label: "收藏" }, { id: "recent", label: "最近" }];
  // Folder tabs show a two-character name (folder-short-name.ts); the whole name is the tooltip.
  const miniFolderTab = (id: string, name: string, override?: string): MiniTab => {
    const label = folderShortName(name, override);
    return label === name.trim() ? { id, label } : { id, label, fullName: name };
  };
  const miniFolderTabs: MiniTab[] = imageView
    ? [...imageLibrary.folders.map((folder) => miniFolderTab(imageFolderFilter(folder.name), folder.name, folder.shortName)), { id: IMAGE_FILTER_UNCATEGORIZED, label: "未分类" }]
    : [...activeFolders.map((folder) => miniFolderTab(`folder:${folder}`, folder, folderShortNames?.[activeKind]?.[folder]))];
  const miniTabActive = imageView ? imageLibrary.filter : activeFolder;
  const selectMiniTab = (id: string) => { if (imageView) imageLibrary.setFilter(id); else selectFolder(id); };
  // The 账号 section's content goes inside the veil (it stays mounted, so sliding open shows it at once); other sections are left as they are.
  const wrapAccountVeil = (content: ReactNode) => (accountMode && slideUnlockOn ? <AccountVeil veiled={accountVeiled} onUnlock={() => setAccountSlidOpen(true)}>{content}</AccountVeil> : content);
  const searchInput = <input ref={searchRef} disabled={lockedHere} value={query} onChange={(e) => { setQuery(e.target.value); setSelected(0); setRowMenuId(""); if (!e.target.value.trim()) { setSearchAllFolders(false); setEnglishSearch(false); } }} onKeyDown={handleSearchKey} aria-label={searchPlaceholder} placeholder={isMini ? (imageView ? "搜索图片" : activeKind === "secret" ? `搜索${SECRET_WORD}` : "搜索话术") : searchPlaceholder} />;
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
      onSyncCode={readSharedUrl() ? undefined : openSyncCode}
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

  // Every folder, the standard 话术 ones too (D-035), can move to any other place in the list.
  const canMoveFolder = (folder: string, delta: -1 | 1) => Boolean(activeFolders[activeFolders.indexOf(folder) + delta]);
  // Pinned and unpinned cards sort apart, so a card only swaps with a neighbour of its own group.
  const canMoveCard = (item: SecretItem, delta: -1 | 1) => Boolean(cardMoves.get(item.id)?.[delta < 0 ? "up" : "down"]);
  const renderFolderRow = (folder: string) => {
    const sortable = true;
    const active = activeFolder === `folder:${folder}`;
    const renaming = renamingFolder?.from === folder;
    const count = folderCounts.get(folder) ?? 0;
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
        canMoveUp={canMoveFolder(folder, -1)}
        canMoveDown={canMoveFolder(folder, 1)}
        onMove={(delta) => { void persistFolderOrder((latest) => moveName(latest, folder, delta), "目录顺序已更新", true); }}
      />
    );
  };
  const menuFolder = folderMenu && activeFolders.includes(folderMenu) ? folderMenu : "";
  const menuFolderCount = menuFolder ? folderCounts.get(menuFolder) ?? 0 : 0;

  const legacyList = (
            <div key={`${activeKind}:${activeFolder}`} className={`native-list list-switch ${bulkMode ? "bulk" : ""}`} onAnimationEnd={onRowAnimationEnd}>
              {modalOpen && !editing && activeFolder !== "trash" && <article className={`native-row selected editing new-row ${activeKind === "snippet" ? "snippet-row" : "secret-row"}`}>{editorNode}</article>}
              {filtered.length === 0 ? (modalOpen && !editing ? null : emptyState) : activeFolder === "trash" ? filtered.map((item, index) => (
                <article key={item.id} data-row-index={index} className={`native-row trash-row ${activeKind === "snippet" ? "snippet-row" : "secret-row"} ${safeSelected === index ? "selected" : ""}`}>
                  <span className="trash-row-icon" aria-hidden="true"><Icon name="trash" /></span>
                  <div className="row-main trash-row-main">
                    <span className="row-copy"><strong className={activeKind === "snippet" ? "snippet-label" : undefined}>{activeKind === "snippet" ? <SnippetTitle label={item.label} query={query} /> : <Highlight text={item.label} query={query} />}</strong>{activeKind === "snippet" && <small>{item.folder || "未分类"}</small>}</span>
                  </div>
                  <button type="button" className="trash-restore" onClick={() => void restoreItem(item)} aria-label={`恢复 ${item.label}`}>恢复</button>
                  <button type="button" className="trash-permanent" onClick={() => setDeleteRequest({ item, permanent: true })} aria-label={`永久删除 ${item.label}`}>永久删除</button>
                </article>
              )) : filtered.map((item, index) => {
                const isSnippet = activeKind === "snippet";
                if (modalOpen && editing?.id === item.id) {
                  return <article key={item.id} data-row-index={index} className={`native-row selected editing ${isSnippet ? "snippet-row" : "secret-row"}`}>{editorNode}</article>;
                }
                const isSelected = expandedIndex === index && !bulkMode;
                const checked = bulkIds.includes(item.id);
                const revealed = secretReveal.isShown(item.id);
                const closing = !isSelected && !bulkMode && closingIds.includes(item.id);
                const moveTargets = activeFolders.filter((folder) => folder !== (item.folder || ""));
                return (
                  <article key={item.id} data-row-index={index} data-sort-scope="card" data-sort-id={item.id} className={`native-row ${isSnippet ? "snippet-row" : "secret-row"} ${item.pinned ? "pinned" : ""} ${isSelected || closing ? "selected" : ""} ${closing ? "closing-row" : ""} ${checked ? "checked" : ""} ${copiedId === item.id ? "copied" : ""} ${copiedReferenceId === item.id ? "reference-copied" : ""} ${cardReorder.draggingId === item.id ? "dragging" : ""} ${cardReorder.overId === item.id && cardReorder.draggingId !== item.id ? "drag-over" : ""}`}>
                    <div className="row-line">
                      {bulkMode
                        ? <button type="button" className={`row-check ${checked ? "on" : ""}`} role="checkbox" aria-checked={checked} aria-label={`选择 ${item.label}`} onClick={() => toggleBulk(item.id)}><Icon name="check" /></button>
                        : <ReorderHandle className="drag-handle" disabled={!cardDragEnabled} label={`拖动排序 ${item.label}`} title={cardDragEnabled ? "按住拖动，点一下可上移下移" : "清除搜索和筛选后可排序"} canMoveUp={canMoveCard(item, -1)} canMoveDown={canMoveCard(item, 1)} onBeginDrag={(event) => cardReorder.beginPointerDrag(event, item.id)} onMove={(delta) => { void persistCardOrder((latest) => moveVisibleItem(latest, filtered.map((entry) => entry.id), item.id, delta), "顺序已更新", true); }}><span className="grip-pill" style={{ color: categoryColors[item.folder || ""] || UNCATEGORIZED_COLOR }}><Icon name="grip" /></span></ReorderHandle>}
                      <button type="button" className="row-main" onClick={() => { if (bulkMode) { toggleBulk(item.id); return; } selectRow(index); }} onDoubleClick={() => { if (!bulkMode) void copy(item); }} aria-expanded={bulkMode ? undefined : isSelected} aria-label={bulkMode ? `选择 ${item.label}` : `${isSelected ? "已展开" : "展开"} ${item.label}`}>
                        <span className="row-copy">
                          <span className="row-title">
                            <strong className={isSnippet ? "snippet-label" : undefined}>{isSnippet ? <SnippetTitle label={item.label} query={query} /> : <Highlight text={item.label} query={query} />}</strong>
                            {isSelected && isSnippet && item.snippetNumber && <b className="row-snippet-number">{displaySnippetNumber(item.snippetNumber)}</b>}
                            {showFolderChip && isSnippet && item.folder && <small className="row-folder">{item.folder}</small>}
                            {isSnippet && sharedMark(item) && <small className="row-shared-mark" data-mark={sharedMark(item)}>{sharedMark(item) === "update" ? "公司版有更新" : "公司已停用"}</small>}
                          </span>
                          {!isSelected && isSnippet && <small className="snippet-preview" lang="en"><SnippetContent text={item.secret} query={query} /></small>}
                        </span>
                      </button>
                      {!isSnippet && !PLAIN_NOTES && <button type="button" className="native-reference" onClick={() => void copySecretReference(item)} aria-label={copiedReferenceId === item.id ? `已复制引用 ${item.label}` : `复制引用 ${item.label}`} title={copiedReferenceId === item.id ? "引用已复制" : "复制引用，发给其他任务"}><span className="reference-glyph" aria-hidden="true" /><span className="reference-check" aria-hidden="true">✓</span></button>}
                      <button type="button" className="native-copy" onClick={() => void copy(item)} aria-label={copiedId === item.id ? `已复制 ${item.label}` : `复制 ${item.label}`} title={copiedId === item.id ? "已复制" : "复制"}><span className="copy-glyph" aria-hidden="true" /><span className="copy-check" aria-hidden="true">✓</span></button>
                      {isSelected && isSnippet && <button type="button" className="ghost-button select-toggle row-collapse" onClick={collapseCards} aria-label="收起这条话术">收起</button>}
                      {isSelected && isSnippet && hasPreparedCopy(item) && item.snippetMeta?.chineseText?.trim() && <div className="copy-language row-language" role="group" aria-label="复制语言">
                        <button type="button" className={fillFor(item).language === "en" ? "active" : ""} onClick={() => updateFill(item)((current) => ({ ...current, language: "en" }))}>英文</button>
                        <button type="button" className={fillFor(item).language === "zh" ? "active" : ""} onClick={() => updateFill(item)((current) => ({ ...current, language: "zh" }))}>中文</button>
                      </div>}
                      <button type="button" className="native-pin" onClick={() => togglePinned(item)} aria-label={`${item.pinned ? "取消收藏" : "收藏"} ${item.label}`} aria-pressed={Boolean(item.pinned)} title={item.pinned ? "取消收藏" : "收藏"}><Icon name="star" filled={Boolean(item.pinned)} /></button>
                      {copiedId === item.id && <span className="copy-status" role="status" aria-live="polite">已复制</span>}
                      {!PLAIN_NOTES && copiedReferenceId === item.id && <span className="copy-status" role="status" aria-live="polite">引用已复制</span>}
                    </div>
                    {(isSelected || closing) && <div className={`row-detail ${closing ? "closing" : ""}`} inert={closing} aria-hidden={closing || undefined}><div className="row-detail-inner">
                      {isSnippet && sharedMark(item) && <SharedNotice item={item} onAccept={() => void resolveShared(item.id, acceptSharedUpdate)} onKeep={() => void resolveShared(item.id, keepMySharedVersion)} />}
                      {isSnippet ? (hasPreparedCopy(item) ? <SnippetFill item={item} state={fillFor(item)} onState={updateFill(item)} renderText={(text) => <Highlight text={text} query={query} />} onSubmit={() => void copy(item)} onActive={(name) => { setActiveVar(name ? { id: item.id, name } : null); if (!name) setValueMenu(null); }} onFocusChange={setTypingVariable} onPin={(name) => pinValue(item, name)} isPinned={(name) => isPinned(pinnedValues, name, (fillFor(item).values[name] || "").trim())} /> : <p className="row-content" lang="en"><SnippetContent text={item.secret} query={query} /></p>) : PLAIN_NOTES ? <p className="row-content"><Highlight text={item.secret} query={query} /></p> : (
                        <div className={`row-secret ${revealed ? "revealed" : ""}`}>
                          <span className="row-secret-value">{revealed ? item.secret : "••••••••••••••••"}</span>
                          <RevealButtons reveal={secretReveal} id={item.id} label="内容" className="ghost-button reveal-button" />
                        </div>
                      )}
                      <div className="row-actions">
                          <button type="button" className="primary-button copy-main" aria-label={copiedId === item.id ? "已复制" : isSnippet && fillFor(item).language === "zh" ? "复制中文" : "复制"} data-copied={copiedId === item.id ? "" : undefined} onClick={() => void copy(item)}><span className="copy-main-icon" aria-hidden="true"><Icon name="copy" /><Icon name="check" className="copy-tick" /></span><span className="copy-main-label"><span>{isSnippet && fillFor(item).language === "zh" ? "复制中文" : "复制"}</span><span>已复制</span></span></button>
                          {!isSnippet && !PLAIN_NOTES && <button type="button" className="secondary-button" onClick={() => void copySecretReference(item)} title={`只复制编号，${SECRET_WORD}本身不会出现在聊天或日志里`}><Icon name={copiedReferenceId === item.id ? "check" : "link"} />{copiedReferenceId === item.id ? "引用已复制" : "复制引用"}</button>}
                          <button type="button" className="ghost-button" onClick={() => openEditor(item)}>编辑</button>
                          {isSnippet && !closing && activeVar?.id === item.id && fixedOptions(activeVar.name).length > 0 && <VariablePopup rowId={item.id} name={activeVar.name} options={fixedOptions(activeVar.name)} current={fillFor(item).values[activeVar.name] || ""} onPick={(value) => pickRemembered(item, activeVar.name, value)} />}
                          {isSnippet && !closing && variableNames(item).some((name) => memoryOptions(valueMemory, pinnedValues, name).length > 0) && <span className="var-memory" aria-label="常用值">
                            {valuesCollapsed ? <button type="button" className="var-collapse" aria-expanded="false" aria-label="展开常用值" title="展开常用值" onMouseDown={(event) => event.preventDefault()} onClick={toggleValuesCollapsed}>常用值<Icon name="chevronDown" /></button> : <>
                            {variableNames(item).map((name) => memoryOptions(valueMemory, pinnedValues, name).length > 0 && <span key={name} className="var-memory-group" role="group" aria-label={`${name} 最近用过的`}>
                            {variableNames(item).length > 1 && <span className="var-memory-name" aria-hidden="true">{name}</span>}
                            {/* mousedown is stopped so the block keeps focus until the click lands */}
                            {memoryOptions(valueMemory, pinnedValues, name).map((option) => <span key={option} role="presentation" data-selected={option === fillFor(item).values[name] ? "" : undefined} data-pinned={isPinned(pinnedValues, name, option) ? "" : undefined} className="var-memory-option" onMouseDown={(event) => event.preventDefault()} data-option-value={option} onContextMenu={(event) => { event.preventDefault(); setValueMenu({ name, value: option, x: event.clientX, y: event.clientY }); }}>
                              <ReorderHandle className="var-grip" label={`拖动排序 ${option}`} title="按住拖动，点一下可上移或下移" canMoveUp={canStepOption(name, option, -1)} canMoveDown={canStepOption(name, option, 1)} onBeginDrag={(event) => startOptionDrag(event, name, option)} onMove={(delta) => stepOption(name, option, delta)}><span className="grip-pill" aria-hidden="true"><Icon name="grip" /></span></ReorderHandle>
                              <button type="button" className="var-memory-pick" title={`${option}（右键：固定 / 解锁 / 删除）`} onClick={() => pickRemembered(item, name, option)}>{option}</button>
                            </span>)}
                            </span>)}
                            <span className="var-tail"><button type="button" className="var-collapse" aria-expanded="true" aria-label="收起常用值" title="收起常用值" onMouseDown={(event) => event.preventDefault()} onClick={toggleValuesCollapsed}>收起<Icon name="chevronUp" /></button>
                            <button type="button" className="var-help" aria-label="常用值说明" onMouseDown={(event) => event.preventDefault()} onClick={showVariableHelp}>?</button></span>
                            </>}
                            {valueMenu && <VariableMenu x={valueMenu.x} y={valueMenu.y} pinned={isPinned(pinnedValues, valueMenu.name, valueMenu.value)} onPin={() => pinValue(item, valueMenu.name, valueMenu.value)} onUnpin={() => pinValue(item, valueMenu.name, valueMenu.value)} onDelete={() => removeValue(valueMenu.name, valueMenu.value)} onClose={() => setValueMenu(null)} />}
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
            </div>
  );

  return (
    <main className={`desktop-stage ${isMini ? "mini-stage" : ""}`}>
      <section className={`app-shell ${isMini ? "mini" : "full"} ${backgroundInert ? "editing" : ""}`} inert={backgroundInert}>
        {isMini ? <>
          <header className="mini-top drag-region">
            <div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div>
            <div className="mini-top-center">
              {kindSwitch}
              <MiniTabs label="范围" tabs={miniTopTabs} active={miniTabActive} onSelect={selectMiniTab} />
            </div>
            <button type="button" className="icon-button" onClick={() => requestWindowMode("full")} aria-label="恢复完整窗口" title="恢复完整窗口"><Icon name="restore" /></button>
          </header>
          <div className="mini-search">
            <div className="native-search">
              <Icon name="search" className="search-glyph" />
              {searchInput}
            </div>
          </div>
          <div className="mini-folders">{miniFolderTabs.length > 0 && <MiniTabs className="chips" label="目录" tabs={miniFolderTabs} active={miniTabActive} onSelect={selectMiniTab} />}</div>
          {imageView && <ImageSection ref={imageSectionRef} library={imageLibrary} query={query} compact view="grid" paused={backgroundInert} selecting={false} onSelectingChange={setImageSelecting} onToast={flashToast} onTrashed={offerImageUndo} onCounts={setImageCounts} />}
          {!imageView && lockedHere && <div className="native-list mini-list"><div className="native-empty"><strong>账号页已上锁</strong><span>回到完整窗口，输入密码后再用</span></div></div>}
          {!imageView && !lockedHere && <div key={`mini:${activeKind}:${activeFolder}`} className="native-list mini-list list-switch" onAnimationEnd={onRowAnimationEnd}>
            {filtered.length === 0 ? emptyState : filtered.map((item, index) => {
              const isSelected = safeSelected === index;
              if (activeKind === "snippet") {
                if (modalOpen && editing?.id === item.id) return <article key={item.id} data-row-index={index} className="native-row selected editing snippet-row mini-editing">{editorNode}</article>;
                const open = miniOpenId === item.id;
                const closing = !open && miniClosingId === item.id;
                const copied = copiedId === item.id;
                return (
                  <article key={item.id} data-row-index={index} className={`native-row mini-row snippet-row ${isSelected ? "selected" : ""} ${open ? "open" : ""} ${copied ? "copied" : ""}`}>
                    <button type="button" className="row-main" onClick={() => toggleMiniRow(item, index)} aria-expanded={open} aria-label={`${open ? "收起" : "展开"} ${item.label}`}>
                      <i className="row-dot" aria-hidden="true" style={{ background: categoryColors[item.folder || ""] || UNCATEGORIZED_COLOR }} />
                      <span className="row-copy">
                        <strong className="snippet-label"><SnippetTitle label={item.label} query={query} /></strong>
                        {!open && <small className="snippet-preview" lang="en"><SnippetContent text={item.secret} query={query} /></small>}
                      </span>
                      {item.pinned && <Icon name="star" filled className="row-star" />}
                    </button>
                    <button type="button" className="mini-copy" data-copied={copied ? "" : undefined} onClick={() => { setSelected(index); void copyMini(item); }} aria-label={copied ? `已复制 ${item.label}` : `复制 ${item.label}`}>
                      <span className="mini-copy-icon" aria-hidden="true"><Icon name="copy" /><Icon name="check" className="copy-tick" /></span>
                      <span className="mini-copy-label" aria-hidden="true"><span>复制</span><span>已复制</span></span>
                    </button>
                    {(open || closing) && <div className={`row-detail mini-detail ${closing ? "closing" : ""}`} inert={closing} aria-hidden={closing || undefined}><div className="row-detail-inner">
                      <p className="row-content" lang="en"><SnippetContent text={item.secret} query={query} /></p>
                      <div className="mini-actions"><button type="button" className="ghost-button" onClick={() => openEditor(item)} aria-label={`修改 ${item.label}`}>修改</button></div>
                    </div></div>}
                    {copied && <span className="copy-status" role="status" aria-live="polite">已复制</span>}
                  </article>
                );
              }
              // 账号 rows copy on click, as before: opening one would show its contents in the small window.
              return (
                <article key={item.id} data-row-index={index} className={`native-row mini-row secret-row ${isSelected ? "selected" : ""} ${copiedId === item.id ? "copied" : ""}`}>
                  <button type="button" className="row-main" onClick={() => { setSelected(index); void copyRaw(item); }} aria-label={copiedId === item.id ? `已复制 ${item.label}` : `复制 ${item.label}`}>
                    <i className="row-dot" aria-hidden="true" style={{ background: categoryColors[item.folder || ""] || UNCATEGORIZED_COLOR }} />
                    <span className="row-copy">
                      <strong><Highlight text={item.label} query={query} /></strong>
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
              {directoryShortcuts.map((shortcut) => {
                const accountAll = accountMode && shortcut.id === "all";
                const active = activeFolder === shortcut.id && (!accountAll || vaultCat === "all");
                return <button key={shortcut.id} type="button" className={`nav-item ${active ? "active" : ""}`} onClick={() => { selectFolder(shortcut.id); if (accountAll) setVaultCat("all"); }}><span className="nav-icon"><Icon name={shortcut.id === "pinned" ? "star" : shortcut.id === "recent" ? "clock" : "grid"} className={shortcut.id === "all" ? "accent" : undefined} /></span><span className="nav-label">{shortcut.id === "all" ? "全部" : shortcut.label}</span><b>{accountMode && account.entries ? (shortcut.id === "all" ? account.entries.length : shortcut.id === "pinned" ? account.entries.filter((entry) => entry.pinned).length : shortcut.id === "recent" ? Math.min(20, account.entries.filter((entry) => entry.lastUsedAt).length) : shortcut.count) : shortcut.count}</b></button>;
              })}
            </nav>
            {accountMode && <>
              <div className="nav-heading"><span>分类</span></div>
              <nav className="nav-list account-categories" aria-label="分类">
                {categoryList.map((id) => <button key={id} type="button" className={`nav-item ${activeFolder === "all" && vaultCat === id ? "active" : ""}`} onClick={() => { selectFolder("all"); setVaultCat(id); }}><span className="nav-icon"><Icon name={id === "login" ? "lock" : id === "recovery" ? "shield" : id === "note" ? "note" : id === "apikey" ? "link" : id === "totp" ? "clock" : "grid"} /></span><span className="nav-label">{CATEGORY_LABEL[id]}</span><b>{accountCounts[id]}</b></button>)}
              </nav>
            </>}
            {!accountMode && <>
            <div className="nav-heading">
              <span>目录</span>
              <button ref={folderCreateButtonRef} type="button" onClick={startNewFolder} aria-label="新建目录" title="新建目录"><Icon name="plus" /></button>
            </div>
            <div className="nav-scroll directory-list">
              {activeFolders.map(renderFolderRow)}
              {newFolder && (
                <form className="directory-new" onSubmit={(event) => { event.preventDefault(); void submitNewFolder(); }}>
                  <i className="directory-color-marker hollow" aria-hidden="true" />
                  <input ref={newFolderInputRef} value={newFolder.name} placeholder="目录名称" title="输入名称，回车创建" aria-label="新目录名称" aria-invalid={Boolean(newFolder.error)} maxLength={30}
                    onChange={(event) => setNewFolder({ name: event.target.value, error: "" })}
                    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelNewFolder(); } }}
                    onBlur={() => window.setTimeout(() => setNewFolder((current) => current && !current.name.trim() ? null : current), 120)} />
                  {newFolder.error && <small className="directory-error" role="alert">{newFolder.error}</small>}
                </form>
              )}
            </div></>}
            </>}
            <DailyTipsCard />
            <div className="nav-footer">
              {!imageView && <button type="button" className={`nav-item ${activeFolder === "trash" ? "active" : ""}`} onClick={() => selectFolder("trash")}><span className="nav-icon"><Icon name="trash" /></span><span className="nav-label">回收站</span>{trashedKindItems.length + (accountMode ? account.trashed.length : 0) > 0 && <b>{trashedKindItems.length + (accountMode ? account.trashed.length : 0)}</b>}</button>}
              {imageView && <button type="button" className={`nav-item ${imageLibrary.filter === IMAGE_FILTER_TRASH ? "active" : ""}`} onClick={() => imageLibrary.setFilter(IMAGE_FILTER_TRASH)}><span className="nav-icon"><Icon name="trash" /></span><span className="nav-label">回收站</span>{imageLibrary.trashed.length > 0 && <b>{imageLibrary.trashed.length}</b>}</button>}
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
                : <>
                  {vaultPage
                    ? activeFolder !== "trash" && !lockedHere && !accountVeiled && <span className="add-menu-wrap">
                      <button type="button" className="primary-button add-button" aria-label="新增条目" aria-haspopup={addAsksType ? "menu" : undefined} aria-expanded={addAsksType ? addMenuOpen : undefined}
                        onClick={() => { if (addAsksType) setAddMenuOpen((open) => !open); else addAccount(vaultCat as EntryKind); }}><Icon name="plus" />新增</button>
                      {addMenuOpen && addAsksType && <>
                        <div className="menu-scrim" role="presentation" onMouseDown={() => setAddMenuOpen(false)} />
                        <div className="dropdown acct-menu" role="menu" aria-label="新增什么">
                          {categoryList.map((id) => <button key={id} type="button" role="menuitem" onClick={() => addAccount(id)}>{CATEGORY_LABEL[id]}</button>)}
                        </div>
                      </>}
                    </span>
                    : canAddItemInFolder(activeFolder) && !accountVeiled && <button type="button" className="primary-button add-button" onClick={() => openEditor(null)} aria-label="新增条目"><Icon name="plus" />新增</button>}
                </>}
              {/* Only a desktop shell (or the web preview's stand-in) can keep the window on top; a plain browser tab gets no button. */}
              {typeof window !== "undefined" && window.clipboxDesktop?.setPinned && <button type="button" className={`icon-button pin-on-top${pinOnTop ? " active" : ""}`} onClick={togglePinOnTop} aria-pressed={pinOnTop} aria-label={pinOnTop ? "取消固定" : "固定在最上层"} title={pinOnTop ? "取消固定" : "固定在最上层"}><Icon name="pin" filled={pinOnTop} /></button>}
              <button type="button" className="icon-button" onClick={() => requestWindowMode("mini")} aria-label="迷你模式" title="迷你模式"><Icon name="mini" /></button>
            </header>
            {lockedHere ? <AccountLockScreen deviceKey={deviceKey} onUnlock={(key) => { setAccountSecret(key ?? deviceKey); setAccountUnlocked(true); }} /> : wrapAccountVeil(<>
            {vaultPage && <>
              <div className="section-head"><h1>{sectionTitle}</h1><span className="spacer" />
                {(activeFolder === "all" || activeFolder === "pinned") && !acctSelecting && !accountVeiled && (account.entries?.length ?? 0) > 0 && !(vaultCat === "other" && activeFolder === "all") && <button type="button" className="ghost-button select-toggle collapse-cards" aria-pressed={acctFolded} aria-label={acctFolded ? "展开账号" : "收起账号"} onClick={() => setAcctFolded((value) => !value)}>{acctFolded ? "展开" : "收起"}</button>}
                {activeFolder !== "trash" && !accountVeiled && (account.entries?.length ?? 0) > 0 && !(vaultCat === "other" && activeFolder === "all") && <button type="button" className={`ghost-button select-toggle ${acctSelecting ? "active" : ""}`} aria-pressed={acctSelecting} onClick={() => setAcctSelecting((value) => !value)}>{acctSelecting ? "取消选择" : "选择"}</button>}
                <span className="section-note" title="内容用本机密钥加密保存；导出「账号备份」时会一起加密带上。"><Icon name="lock" />本机加密</span></div>
              <AccountPage deviceKey={accountKey} entries={account.entries} trashed={account.trashed} marks={account.marks} error={account.error} category={vaultCat} view={activeFolder as "all" | "pinned" | "recent" | "trash"} query={query} addRequest={vaultAdd} onOpenLegacy={openLegacyEntry} onPinLegacy={(id) => { const found = items.find((entry) => entry.id === id); if (found) togglePinned(found); }} onToast={flashToast}
                selecting={acctSelecting} folded={acctFolded} onSelectingChange={setAcctSelecting} onTrashLegacy={(ids) => trashNow(items.filter((entry) => ids.includes(entry.id)))}
                legacyView={legacyList} />
            </>}
            {!vaultPage && <div className="section-head">
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
              {!imageView && activeKind === "snippet" && activeFolder !== "trash" && selectedCardId !== "" && !bulkMode && !modalOpen && <button type="button" className="ghost-button select-toggle collapse-cards" aria-label="收起展开的话术" onClick={collapseCards}>收起</button>}
              {!imageView && activeFolder !== "trash" && filtered.length > 0 && !modalOpen && !accountVeiled && <button type="button" className={`ghost-button select-toggle ${bulkMode ? "active" : ""}`} aria-pressed={bulkMode} onClick={() => bulkMode ? exitBulk() : setBulkMode(true)}>{bulkMode ? "取消选择" : "选择"}</button>}
              {!imageView && activeKind === "snippet" && activeFolder !== "trash" && <div className="product-filter-wrap">
                <button type="button" className={productFilter !== "全部产品" ? "product-filter active" : "product-filter"} onClick={() => setProductMenuOpen((value) => !value)} aria-expanded={productMenuOpen}>{productFilter}<Icon name="chevron" /></button>
                <AnimatePresence>{productMenuOpen && <ArcMenu className="product-filter-menu">
                  {["全部产品", ...PRODUCT_GROUPS].map((product) => <button type="button" role="menuitem" className={productFilter === product ? "active" : ""} key={product} onClick={() => { setProductFilter(product); setProductMenuOpen(false); setSelected(0); }}>{product}<span>{productFilter === product ? "✓" : ""}</span></button>)}
                </ArcMenu>}</AnimatePresence>
              </div>}
              {!imageView && activeKind === "secret" && !PLAIN_NOTES && activeFolder !== "trash" && <span className="section-note"><Icon name="lock" />本机加密</span>}
              {imageView && imageLibrary.filter !== IMAGE_FILTER_TRASH && !imageSelecting && imageCounts.open && !modalOpen && <button type="button" className="ghost-button select-toggle collapse-cards" aria-label="收起展开的图片" onClick={() => imageSectionRef.current?.collapse()}>收起</button>}
              {imageView && imageLibrary.filter !== IMAGE_FILTER_TRASH && imageCounts.shown > 0 && !modalOpen && <button type="button" className={`ghost-button select-toggle ${imageSelecting ? "active" : ""}`} aria-pressed={imageSelecting} onClick={() => setImageSelecting((value) => !value)}>{imageSelecting ? "取消选择" : "选择"}</button>}
              {imageView && <ImageViewSwitch view={imageViewMode} onChange={setImageViewMode} />}
            </div>}
            {imageView && <ImageSection ref={imageSectionRef} library={imageLibrary} query={query} compact={false} view={imageViewMode} paused={backgroundInert} selecting={imageSelecting} onSelectingChange={setImageSelecting} onToast={flashToast} onTrashed={offerImageUndo} onCounts={setImageCounts} />}
            {!imageView && !vaultPage && <ListScrollFrame>{legacyList}</ListScrollFrame>}
            {bulkMode && <div className="bulk-bar" role="toolbar" aria-label="批量操作">
              <strong>已选 {bulkCount} 条</strong>
              <button type="button" className="ghost-button" onClick={() => setBulkIds(bulkCount === filtered.length ? [] : filtered.map((item) => item.id))}>{bulkCount === filtered.length ? "全不选" : "全选"}</button>
              <span className="spacer" />
              {activeFolders.length > 0 && <div className="menu-wrap">
                <button type="button" className="secondary-button" disabled={bulkCount === 0} aria-expanded={bulkMoveOpen} onClick={() => setBulkMoveOpen((value) => !value)}>移动到<Icon name="chevron" /></button>
                <AnimatePresence>{bulkMoveOpen && <ArcMenu className="dropdown bulk-menu" origin="bottom left">
                  {activeFolders.map((folder) => <button type="button" role="menuitem" key={folder || "uncategorized"} onClick={() => void bulkMoveTo(folder)}><i className="menu-dot" aria-hidden="true" style={{ background: folder ? categoryColors[folder] : UNCATEGORIZED_COLOR }} />{folder || "未分类"}</button>)}
                </ArcMenu>}</AnimatePresence>
              </div>}
              <button type="button" className="secondary-button danger-text" disabled={bulkCount === 0} onClick={() => void bulkTrash()}>移到回收站</button>
              <button type="button" className="primary-button" onClick={exitBulk}>完成</button>
            </div>}
            </>)}
          </section>
        </>}
      </section>
      {settingsOpen && <SettingsDialog
        testTools={!window.clipboxDesktop || Boolean(window.clipboxDesktop.testTools)}
        onPreviewTest={async () => {
          const snippets = planClearSampleSnippets(itemsRef.current);
          const accountPart = accountLocked || PLAIN_NOTES ? null : await previewClearSamples(accountKey);
          return { snippets: snippets.ids.length, accounts: accountPart === null ? null : accountPart.length, accountNames: accountPart ?? [], keptEdited: snippets.keptEdited };
        }}
        onImportTest={async () => {
          try {
            const plan = planImportSampleSnippets(itemsRef.current, timestampNow());
            if (plan.add.length > 0 || plan.revive.length > 0) {
              await persist((current) => ({
                ...current,
                items: applyImportSampleSnippets(current.items, plan),
                folders: { secret: current.folders.secret, snippet: Array.from(new Set([...current.folders.snippet, ...plan.folders])) },
              }));
            }
            const accounts = accountLocked || PLAIN_NOTES ? { added: 0 } : await restoreSampleEntries(accountKey);
            if (accounts.added > 0) setVaultRev((n) => n + 1);
            const total = plan.add.length + plan.revive.length + accounts.added;
            flashToast(total === 0 ? "测试内容都在，没有缺的" : `已放入测试内容：话术 ${plan.add.length + plan.revive.length} 条${PLAIN_NOTES ? "" : `，${SECRET_WORD} ${accounts.added} 条${accountLocked ? "（账号已锁，没有处理）" : ""}`}`);
          } catch { flashToast("导入失败，数据没有改动"); }
        }}
        onClearTest={async () => {
          try {
            const plan = planClearSampleSnippets(itemsRef.current);
            if (plan.ids.length > 0) await persist((current) => ({ ...current, items: moveItemsToTrash(current.items, plan.ids, timestampNow()) }));
            const accounts = accountLocked || PLAIN_NOTES ? { removed: 0, keptEdited: 0 } : await clearSampleEntries(accountKey);
            if (accounts.removed > 0) setVaultRev((n) => n + 1);
            const total = plan.ids.length + accounts.removed;
            const kept = plan.keptEdited + accounts.keptEdited;
            flashToast(total === 0 ? "没有可清除的测试内容" : `已清除 ${total} 条测试内容${kept > 0 ? `，${kept} 条你改过的已保留` : ""}`);
          } catch { flashToast("清除失败，数据没有改动"); }
        }}
        version={appVersion}
        buildTime={buildTime}
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
        onFolderShortName={settingsFolderShortName}
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
        slideUnlock={{ on: slideUnlockOn, onChange: (on) => { writeSlideUnlockOn(on); setSlideUnlockOn(on); } }}
        accountLock={{ mode: lockModeNow, deviceKey, onChanged: (mode, key) => { if (mode === "none" && accountMode) setAccountSlidOpen(true); setLockSet(mode !== "none"); setLockModeNow(mode); setAccountSecret(key ?? ""); setAccountUnlocked(mode !== "none" && accountMode && key !== null); } }}
        accountLocked={accountLocked}
        onImport={() => { setSettingsOpen(false); fileRef.current?.click(); }}
        onImportSheet={() => { setSettingsOpen(false); spreadsheetFileRef.current?.click(); }}
        onReload={() => { setSettingsOpen(false); void refreshLocalVault(); }}
        usageItems={items}
        onShowItem={showItemInList}
        syncCode={<><CloudAccountRows cloud={cloudSync} platform={cloudPlatform} accountsLocked={!accountKey} /><SyncCodeRow onApply={applySharedLibraryText} /></>}
        sharedLibrary={<SharedLibrarySection onApply={applySharedLibraryText} onExport={exportSharedFile} />}
        onMini={() => { setSettingsOpen(false); requestWindowMode("mini"); }}
        onShowGuide={() => { setSettingsOpen(false); guide.show(); }}
        onOpenAccount={() => { setSettingsOpen(false); switchKind("secret"); }}
      />}
      {guideShown && <FirstRunGuide onClose={guide.close} fallbackFocus=".nav-item[aria-label='设置']" />}
      {automationConsent.dialog}
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
        message={toastState.message}
        className={toastState.actions?.length === 1 ? "undo-toast" : undefined}
        tone={toastState.tone}
        actions={toastState.actions}
        fading={toastState.fading}
        fadeMs={toastState.fadeMs}
        onHold={(held) => { if (held) pauseToast(); else resumeToast(); }}
      />
    </main>
  );
}
