"use client";

import { copyTextWithExpiry } from "./clipboard";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildCategoryColorMap, CATEGORY_PALETTE, UNCATEGORIZED_COLOR } from "./category-colors";
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
  isTrashedItem,
  permanentlyDeleteTrashedItem,
  parseRefreshContext,
  resolveFocusWrapIndex,
  resolveAiRewrite,
  tidyText,
  SNIPPET_NOTE_MAX,
  type AiRewriteMode,
  resolvePostCommitFocusTarget,
  resolveRefreshedActiveFolder,
  resolveSelectedFolder,
  restoreTrashedItem,
  selectItemsByTrashState,
  splitSecretSegments,
  type FolderRegistry,
  type FolderColors,
  deleteFolder,
  folderEditBlocker,
  moveItemsToFolder,
  moveItemsToTrash,
  renameFolder,
  restoreTrashedItems,
  setFolderColor,
  splitSearchHighlight,
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
import { AI_SETTINGS_KEY, DEFAULT_AI_PROMPTS, chatCompletionsUrl, chatRequestBody, parseAiEndpoint, parseChatResponse, readAiSettings, validateAiSettings, type AiSettings } from "./ai-config";
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
type MiniHidePolicy = "hotkey" | "always" | "never";
type ThemeChoice = "system" | "light" | "dark";
// Windows shows this section as 备注; darwin keeps the original 秘密 wording.
// Windows has no password-style masking or reference links: 备注 is a plain notes list.
const PLAIN_NOTES = typeof window === "undefined" || window.clipboxDesktop?.platform !== "darwin";
const SECRET_WORD = typeof window !== "undefined" && window.clipboxDesktop?.platform === "darwin" ? "秘密" : "备注";
type CloseBehavior = "tray" | "quit";
const DETAIL_CLOSE_MS = 220;
const CLOSE_BEHAVIOR_KEY = "clipbox.close-behavior";
const THEME_KEY = "clipbox.theme";
const LAST_BACKUP_KEY = "clipbox.last-backup-at";
const THEME_OPTIONS = ["system", "light", "dark"] as const;
const MINI_HIDE_KEY = "clipbox.mini-hide-policy";
const TRASH_DAYS_KEY = "clipbox.trash-retention-days";
const TRASH_DAY_OPTIONS = [0, 7, 30, 90] as const;

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

declare global {
  interface Window {
    clipboxDesktop?: {
      platform?: string;
      copyText: (text: string) => Promise<void>;
      didCopy: () => void;
      setMiniHidePolicy?: (policy: MiniHidePolicy) => void;
      setCloseBehavior?: (behavior: CloseBehavior) => void;
      getLaunchAtLogin?: () => Promise<boolean>;
      setLaunchAtLogin?: (enabled: boolean) => Promise<boolean>;
      setTheme?: (theme: ThemeChoice) => void;
      openDataFolder?: () => Promise<string>;
      getVersion: () => Promise<string>;
      aiStatus?: () => Promise<{ hasKey: boolean; origin: string }>;
      aiSave?: (settings: { baseUrl: string; key: string }) => Promise<{ hasKey: boolean; origin: string }>;
      aiClear?: () => Promise<{ hasKey: boolean; origin: string }>;
      aiRequest?: (payload: { url: string; body: unknown }) => Promise<{ ok: boolean; status: number; text: string }>;
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

const ICON_PATHS: Record<string, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  mini: <><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><rect x="4" y="13" width="8" height="7" rx="1.5" /></>,
  restore: <><path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" /><path d="M15 4h5v5M20 4l-7 7" /></>,
  grid: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 10h16" /></>,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
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

// Shows Ctrl by default and the Command symbol when the desktop shell tags the page as darwin.
function Keys({ k }: { k: string }) {
  return <kbd><span className="k-win">Ctrl+{k}</span><span className="k-mac">⌘{k}</span></kbd>;
}

function Icon({ name, filled = false, className }: { name: keyof typeof ICON_PATHS; filled?: boolean; className?: string }) {
  return (
    <svg className={`icon${className ? ` ${className}` : ""}`} width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  return <>{splitSearchHighlight(text, query).map((piece, index) => piece.hit
    ? <mark key={index} className="search-hit">{piece.text}</mark>
    : <span key={index}>{piece.text}</span>)}</>;
}

function SnippetContent({ text, query = "" }: { text: string; query?: string }) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return <>{parts.map((part, index) => /^\[[^\]]+\]$/.test(part)
    ? <mark key={index} className="snippet-variable"><Highlight text={part} query={query} /></mark>
    : <span key={index}><Highlight text={part} query={query} /></span>)}</>;
}

function SnippetTitle({ label, query = "" }: { label: string; query?: string }) {
  const separatorIndex = label.search(/[|｜]/);
  if (separatorIndex < 0) return <Highlight text={label} query={query} />;

  const primary = label.slice(0, separatorIndex).trim();
  const detail = label.slice(separatorIndex + 1).trim();
  if (!primary || !detail) return <Highlight text={label} query={query} />;

  return <><span className="snippet-title-primary"><Highlight text={primary} query={query} /></span><span className="snippet-title-separator">｜</span><span className="snippet-title-detail"><Highlight text={detail} query={query} /></span></>;
}

const AI_WEB_KEY = "clipbox.ai-key.web.v1";
type AiKeyStatus = { hasKey: boolean; origin: string };

// A message from the desktop bridge arrives wrapped as "Error invoking remote method …: Error: <text>".
function aiErrorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("Error: ").pop()?.trim() || "AI 接口出错";
}

// The desktop app keeps the key encrypted with the system; a plain browser (preview) falls back to local storage.
async function aiKeyStatus(): Promise<AiKeyStatus> {
  if (window.clipboxDesktop?.aiStatus) return window.clipboxDesktop.aiStatus();
  try {
    const stored = JSON.parse(localStorage.getItem(AI_WEB_KEY) || "null");
    return stored?.key ? { hasKey: true, origin: String(stored.origin || "") } : { hasKey: false, origin: "" };
  } catch { return { hasKey: false, origin: "" }; }
}

async function aiKeySave(baseUrl: string, key: string): Promise<AiKeyStatus> {
  if (window.clipboxDesktop?.aiSave) return window.clipboxDesktop.aiSave({ baseUrl, key });
  const origin = parseAiEndpoint(baseUrl)?.origin || "";
  let existing: { origin?: string; key?: string } = {};
  try { existing = JSON.parse(localStorage.getItem(AI_WEB_KEY) || "{}"); } catch { /* start fresh */ }
  const finalKey = key.trim() || (existing.origin === origin ? existing.key || "" : "");
  if (!finalKey) throw new Error("请填写 API Key");
  localStorage.setItem(AI_WEB_KEY, JSON.stringify({ origin, key: finalKey }));
  return { hasKey: true, origin };
}

async function aiKeyClear(): Promise<AiKeyStatus> {
  if (window.clipboxDesktop?.aiClear) return window.clipboxDesktop.aiClear();
  localStorage.removeItem(AI_WEB_KEY);
  return { hasKey: false, origin: "" };
}

async function aiChat(settings: AiSettings, system: string, user: string): Promise<{ text: string; error: string }> {
  const url = chatCompletionsUrl(settings.baseUrl);
  const body = chatRequestBody(settings.model, system, user);
  try {
    if (window.clipboxDesktop?.aiRequest) {
      const response = await window.clipboxDesktop.aiRequest({ url, body });
      return parseChatResponse(response.status, response.text);
    }
    const stored = JSON.parse(localStorage.getItem(AI_WEB_KEY) || "null");
    if (!stored?.key) return { text: "", error: "还没有保存 API Key" };
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${stored.key}` }, body: JSON.stringify(body) });
    return parseChatResponse(response.status, await response.text());
  } catch (error) {
    return { text: "", error: window.clipboxDesktop ? aiErrorText(error) : "无法连接到接口（浏览器预览可能被跨域限制，桌面版不受影响）" };
  }
}

function cleanAiText(result: string) {
  return result.replace(/^```[a-z]*\n?|```$/gi, "").trim().replace(/^["“](.*)["”]$/s, "$1").trim();
}

// Order: the user's own interface (settings) → the device's own language model → a rule-based tidy
// for 整理. 润色 genuinely needs a model.
async function aiRewrite(mode: AiRewriteMode, value: string): Promise<{ text: string; unavailable: boolean; error?: string }> {
  const custom = readAiSettings(localStorage);
  const prompt = custom ? (mode === "polish" ? custom.polishPrompt : custom.organizePrompt) : DEFAULT_AI_PROMPTS[mode];
  if (custom) {
    const status = await aiKeyStatus().catch(() => ({ hasKey: false, origin: "" }));
    if (status.hasKey) {
      const reply = await aiChat(custom, prompt, value);
      if (reply.error) return { text: "", unavailable: false, error: `AI 接口：${reply.error}` };
      const cleaned = cleanAiText(reply.text);
      return { text: mode === "organize" ? tidyText(cleaned) : cleaned, unavailable: false };
    }
  }
  type LanguageSession = { prompt: (prompt: string) => Promise<string>; destroy?: () => void };
  type LanguageModelAPI = { create: () => Promise<LanguageSession> };
  const model = (window as unknown as { LanguageModel?: LanguageModelAPI }).LanguageModel;
  if (model?.create) {
    let session: LanguageSession | undefined;
    try {
      session = await model.create();
      const cleaned = cleanAiText(await session.prompt(`${prompt}\n\n${value}`));
      if (cleaned) return { text: mode === "organize" ? tidyText(cleaned) : cleaned, unavailable: false };
    } catch {
      // Fall through below.
    } finally {
      session?.destroy?.();
    }
  }
  return mode === "organize" ? { text: tidyText(value), unavailable: false } : { text: "", unavailable: true };
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
  const [folderColors, setFolderColors] = useState<FolderColors | undefined>(undefined);
  const [activeKind, setActiveKind] = useState<ItemKind>(DEFAULT_ITEM_KIND);
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newFolder, setNewFolder] = useState<{ name: string; error: string } | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<{ from: string; value: string; error: string } | null>(null);
  const [folderMenu, setFolderMenu] = useState("");
  const [folderMenuPos, setFolderMenuPos] = useState({ top: 0, left: 0 });
  const [folderDeleteArm, setFolderDeleteArm] = useState("");
  const [searchAllFolders, setSearchAllFolders] = useState(false);
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
  const [copyRequest, setCopyRequest] = useState<SnippetCopyRequest | null>(null);
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
  const referenceFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef<SecretItem[]>([]);
  const foldersRef = useRef<FolderRegistry>(EMPTY_FOLDER_REGISTRY);
  const folderColorsRef = useRef<FolderColors | undefined>(undefined);
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
      folderColorsRef.current = data.folderColors;
      nextSnippetNumberRef.current = data.nextSnippetNumber;
      setItems(data.items);
      setFolders(data.folders);
      setFolderColors(data.folderColors);
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
    const matched = normalized ? productMatched.filter((item) => {
      const searchable = activeKind === "snippet"
        ? snippetSearchText(item)
        : `${item.label} ${item.note} ${item.summary || ""}`;
      const haystack = searchable.toLowerCase();
      return normalized.split(/\s+/).every((term) => haystack.includes(term));
    }) : productMatched;
    if (scopeFolder === "recent") return matched.toSorted((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0)).slice(0, 50);
    return matched.toSorted((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  }, [items, query, activeKind, activeFolder, productFilter, searchAllFolders]);

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
  const inlineEditing = modalOpen || Boolean(copyRequest) || Boolean(newFolder) || Boolean(renamingFolder);
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
  }, [activeFolder, activeKind, backupMode, cancelCardDrag, cancelFolderDrag, copyRequest, deleteRequest, newFolder, modalOpen, productFilter, query, snippetImport]);

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
      if (event.key === "Escape" && newFolder && !auxiliaryDialogOpen) { event.preventDefault(); cancelNewFolder(); return; }
      if (!homeShortcutsEnabled) {
        if (homeShortcut) event.preventDefault();
        return;
      }
      const action = homeShortcutAction(event.key, commandKey, inlineEditing || auxiliaryDialogOpen, false, Boolean(backupMode));
      if (action === "search") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (action === "add") {
        event.preventDefault();
        if (windowMode === "mini") { setWindowMode("full"); window.clipboxDesktop?.setWindowMode?.("full"); }
        if (!canAddItemInFolder(activeFolder)) setActiveFolder("all");
        openEditor(null);
      }
      if (action === "edit" && activeFolder !== "trash" && filtered[safeSelected]) {
        event.preventDefault();
        if (windowMode === "mini") { setWindowMode("full"); window.clipboxDesktop?.setWindowMode?.("full"); }
        openEditor(filtered[safeSelected]);
      }
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
      if (homeShortcutAction("k", true, inlineEditing || auxiliaryDialogOpen, false, Boolean(backupMode)) !== "search") return;
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

  // Folder editing from Settings works on either kind, not just the open tab.
  async function settingsFolderRename(kind: ItemKind, from: string, to: string) {
    const error = await commitFolderChange((data) => renameFolder(data, kind, from, to), "目录已重命名");
    if (!error && activeKind === kind && activeFolder === `folder:${from}`) setActiveFolder(`folder:${normalizeFolderName(to)}`);
    return error;
  }

  async function settingsFolderDelete(kind: ItemKind, folder: string) {
    const error = await commitFolderChange((data) => deleteFolder(data, kind, folder), `已删除目录「${folder}」`);
    if (!error && activeKind === kind && activeFolder === `folder:${folder}`) selectFolder("all");
    return error;
  }

  async function settingsFolderAdd(kind: ItemKind, name: string) {
    const result = addFolder(foldersRef.current, kind, name);
    if (!result.folder) return "请输入目录名称";
    if (!result.created) return "已有同名目录";
    return commitFolderChange((data) => ({ data: { ...data, folders: addFolder(data.folders, kind, name).folders } }), "目录已创建");
  }

  function settingsFolderColor(kind: ItemKind, folder: string, color: string | null) {
    void commitFolderChange((data) => ({ data: setFolderColor(data, kind, folder, color) }), "颜色已更新");
  }

  function settingsFolderMove(kind: ItemKind, folder: string, delta: -1 | 1) {
    void commitFolderChange((data) => ({ data: { ...data, folders: { ...data.folders, [kind]: moveName(data.folders[kind], folder, delta) } } }), "目录顺序已更新");
  }

  function settingsFolderReorder(kind: ItemKind, source: string, target: string) {
    void commitFolderChange((data) => ({ data: { ...data, folders: { ...data.folders, [kind]: reorderNames(data.folders[kind], source, target) } } }), "目录顺序已更新");
  }

  function buildSettingsFolderGroups(): SettingsFolderGroup[] {
    return (["snippet", "secret"] as const).map((kind) => {
      const colors = { ...buildCategoryColorMap(folders[kind]), ...(folderColors?.[kind] || {}) };
      return {
        kind,
        title: kind === "snippet" ? "话术目录" : `${SECRET_WORD}目录`,
        folders: folders[kind].map((name) => ({
          name,
          count: items.filter((item) => !isTrashedItem(item) && (item.kind || "secret") === kind && item.folder === name).length,
          color: colors[name] || UNCATEGORIZED_COLOR,
          locked: Boolean(folderEditBlocker(kind, name)),
        })),
      };
    });
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
  const [trashDays, setTrashDays] = useState<number>(() => readStoredChoice<number>(TRASH_DAYS_KEY, TRASH_DAY_OPTIONS, 0));
  useEffect(() => {
    window.clipboxDesktop?.setMiniHidePolicy?.(miniHidePolicy);
    // Only tell the desktop shell about the stored choice once on start; later changes go through chooseMiniHidePolicy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [closeBehavior, setCloseBehavior] = useState<CloseBehavior>(() => readStoredChoice<CloseBehavior>(CLOSE_BEHAVIOR_KEY, ["tray", "quit"], "tray"));
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

  function switchKind(kind: ItemKind) {
    if (kind === activeKind) return;
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
    setCopyRequest(null);
  }

  function selectFolder(folder: string) {
    setActiveFolder(folder);
    if (folder === "trash") setProductFilter("全部产品");
    setSelected(0);
    setRowMenuId("");
    setRevealedId("");
    setFolderMenu("");
    exitBulk();
    setCopyRequest(null);
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
    if (copyRequest && filtered[index]?.id !== copyRequest.item.id) setCopyRequest(null);
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

  async function exportVault(password: string) {
    const currentData = { items: itemsRef.current, folders: foldersRef.current, nextSnippetNumber: nextSnippetNumberRef.current, folderColors: folderColorsRef.current };
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
    ? (activeKind === "snippet" ? "全部话术" : `全部${SECRET_WORD}`)
    : activeFolder === "pinned" ? "收藏"
      : activeFolder === "recent" ? "最近使用"
      : activeFolder === "trash" ? "回收站"
        : activeFolder === "uncategorized" ? "未分类"
          : activeFolder.slice(7);
  const searchPlaceholder = activeFolder === "trash" ? "搜索回收站" : activeKind === "secret" ? `搜索${SECRET_WORD}标题` : "搜索标题、编号或内容";
  const kindSwitch = (
    <div className={`kind-switch ${isMini ? "compact" : ""}`} role="group" aria-label="内容板块">
      {(["snippet", "secret"] as const).map((kind) => <button key={kind} type="button" className={activeKind === kind ? "active" : ""} aria-pressed={activeKind === kind} onClick={() => switchKind(kind)}>{kind === "snippet" ? "话术" : SECRET_WORD}</button>)}
    </div>
  );
  const searchInput = <input ref={searchRef} value={query} onChange={(e) => { setQuery(e.target.value); setSelected(0); setRowMenuId(""); if (!e.target.value.trim()) setSearchAllFolders(false); }} onKeyDown={handleSearchKey} aria-label={searchPlaceholder} placeholder={isMini ? (activeKind === "secret" ? `搜索${SECRET_WORD}` : "搜索话术") : searchPlaceholder} />;
  const firstRun = activeKindItems.length === 0 && !query && activeFolder === "all" && !isMini;
  const emptyState = firstRun ? (
    <div className="native-empty onboarding">
      <VaultMark />
      <strong>{activeKind === "snippet" ? "还没有话术，先添加第一条" : `还没有${SECRET_WORD}，先添加第一条`}</strong>
      <span>{activeKind === "snippet" ? "把常回复的话存进来，一键复制。正文里用 [名字] 标出要替换的内容。" : "密码和密钥加密保存在本机，默认只复制引用，不暴露明文。"}</span>
      <div className="onboarding-actions">
        <button type="button" className="primary-button" onClick={() => openEditor(null)}><Icon name="plus" />新增第一条</button>
        {activeKind === "snippet" && <button type="button" className="secondary-button" onClick={() => spreadsheetFileRef.current?.click()}>导入话术表格</button>}
        <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}>导入备份</button>
      </div>
      <small>内容用 AES-256 加密，只保存在这台设备上</small>
    </div>
  ) : (
    <div className="native-empty"><strong>{query ? "没有匹配的内容" : activeFolder === "trash" ? "回收站是空的" : activeFolder === "pinned" ? "还没有收藏内容" : activeFolder === "recent" ? "还没有使用记录" : "这个目录还是空的"}</strong><span>{query ? (searchAllFolders || activeFolder === "all" ? "换个词搜索试试" : "换个词，或改为搜索全部目录") : activeFolder === "trash" ? "删除的内容会加密保留在这里" : activeFolder === "pinned" ? "点条目右侧的星标添加收藏" : activeFolder === "recent" ? "复制过的内容会出现在这里" : isMini ? "回到完整窗口添加第一条" : "点右上角的「新增」添加第一条"}</span></div>
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
      <div key={folder} {...(sortable ? { "data-sort-scope": "folder", "data-sort-id": folder } : {})} className={`directory-row ${sortable ? "" : "fixed"} ${active ? "active" : ""} ${folderReorder.draggingId === folder ? "dragging" : ""} ${folderReorder.overId === folder && folderReorder.draggingId !== folder ? "drag-over" : ""}`}>
        {renaming ? (
          <form className="directory-rename" onSubmit={(event) => { event.preventDefault(); void submitFolderRename(); }}>
            <i className="directory-color-marker" aria-hidden="true" style={{ background: categoryColors[folder] }} />
            <input ref={renameInputRef} value={renamingFolder.value} aria-label={`重命名 ${folder}`} aria-invalid={Boolean(renamingFolder.error)} maxLength={30}
              onChange={(event) => setRenamingFolder({ ...renamingFolder, value: event.target.value, error: "" })}
              onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setRenamingFolder(null); } }}
              onBlur={() => window.setTimeout(() => setRenamingFolder((current) => current?.from === folder ? null : current), 120)} />
            {renamingFolder.error && <small className="directory-error" role="alert">{renamingFolder.error}</small>}
          </form>
        ) : (
          <button type="button" className="nav-item directory-main" onClick={() => selectFolder(`folder:${folder}`)} title={folder}><span className="nav-icon"><i className="directory-color-marker" aria-hidden="true" style={{ background: categoryColors[folder] }} /></span><span className="nav-label">{folder}</span><b>{count}</b></button>
        )}
        {!renaming && <button type="button" className="folder-more" aria-label={`管理目录 ${folder}`} aria-haspopup="menu" aria-expanded={folderMenu === folder} title="重命名、颜色、删除"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setFolderDeleteArm("");
            setFolderMenuPos({ top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 270)), left: rect.left });
            setFolderMenu((value) => value === folder ? "" : folder);
          }}><Icon name="more" /></button>}
        {sortable && !renaming && <button type="button" className="folder-drag-handle" aria-label={`拖动目录 ${folder}`} title="拖动排序，或按 Option 加方向键" onPointerDown={(event) => folderReorder.beginPointerDrag(event, folder)} onKeyDown={(event) => handleFolderSortKey(event, folder)}><span aria-hidden="true">⠿</span></button>}
      </div>
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
              <label className="mini-folder">
                <span className="sr-only">目录</span>
                <select value={activeFolder} onChange={(event) => selectFolder(event.target.value)}>
                  <option value="all">全部</option>
                  <option value="pinned">收藏</option>
                  <option value="recent">最近使用</option>
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
                      <strong className={activeKind === "snippet" ? "snippet-label" : undefined}>{activeKind === "snippet" ? <SnippetTitle label={item.label} query={query} /> : <Highlight text={item.label} query={query} />}</strong>
                      {activeKind === "snippet" && <small className="snippet-preview" lang="en"><Highlight text={item.secret} query={query} /></small>}
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
            <span><Keys k="E" />编辑</span>
            <span className="spacer" />
            <span>{filtered.length} 条</span>
          </footer>
        </> : <>
          <aside className="sidebar" aria-label="目录">
            <div className="sidebar-top drag-region"><div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div></div>
            {kindSwitch}
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
            </div>
            <div className="nav-footer">
              <button type="button" className={`nav-item ${activeFolder === "trash" ? "active" : ""}`} onClick={() => selectFolder("trash")}><span className="nav-icon"><Icon name="trash" /></span><span className="nav-label">回收站</span>{trashedKindItems.length > 0 && <b>{trashedKindItems.length}</b>}</button>
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
            <header className="toolbar drag-region">
              <div className="native-search">
                <Icon name="search" className="search-glyph" />
                {searchInput}
                <Keys k="K" />
              </div>
              {canAddItemInFolder(activeFolder) && <button type="button" className="primary-button add-button" onClick={() => openEditor(null)} aria-label="新增条目"><Icon name="plus" />新增</button>}
              <button type="button" className="icon-button" onClick={() => requestWindowMode("mini")} aria-label="迷你模式" title="迷你模式"><Icon name="mini" /></button>
            </header>
            <div className="section-head">
              <h1>{sectionTitle}</h1>
              <span className="section-count">{filtered.length}</span>
              <span className="spacer" />
              {searching && activeFolder !== "all" && activeFolder !== "trash" && <div className="scope-switch" role="group" aria-label="搜索范围">
                <button type="button" className={searchAllFolders ? "" : "active"} aria-pressed={!searchAllFolders} onClick={() => { setSearchAllFolders(false); setSelected(0); }}>此目录</button>
                <button type="button" className={searchAllFolders ? "active" : ""} aria-pressed={searchAllFolders} onClick={() => { setSearchAllFolders(true); setSelected(0); }}>全部目录</button>
              </div>}
              {activeFolder !== "trash" && filtered.length > 0 && !modalOpen && <button type="button" className={`ghost-button select-toggle ${bulkMode ? "active" : ""}`} aria-pressed={bulkMode} onClick={() => bulkMode ? exitBulk() : setBulkMode(true)}>{bulkMode ? "取消选择" : "选择"}</button>}
              {activeKind === "snippet" && activeFolder !== "trash" && <div className="product-filter-wrap">
                <button type="button" className={productFilter !== "全部产品" ? "product-filter active" : "product-filter"} onClick={() => setProductMenuOpen((value) => !value)} aria-expanded={productMenuOpen}>{productFilter}<Icon name="chevron" /></button>
                {productMenuOpen && <div className="product-filter-menu" role="menu">
                  {["全部产品", ...PRODUCT_GROUPS].map((product) => <button type="button" role="menuitem" className={productFilter === product ? "active" : ""} key={product} onClick={() => { setProductFilter(product); setProductMenuOpen(false); setSelected(0); }}>{product}<span>{productFilter === product ? "✓" : ""}</span></button>)}
                </div>}
              </div>}
              {activeKind === "secret" && !PLAIN_NOTES && activeFolder !== "trash" && <span className="section-note"><Icon name="lock" />本机加密</span>}
            </div>
            <div key={`${activeKind}:${activeFolder}`} className={`native-list list-switch ${bulkMode ? "bulk" : ""}`}>
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
                const fillOpen = copyRequest?.item.id === item.id && !closing;
                const moveTargets = [...activeFolders, ...(isSnippet ? [] : [""])].filter((folder) => folder !== (item.folder || ""));
                return (
                  <article key={item.id} data-row-index={index} data-sort-scope="card" data-sort-id={item.id} className={`native-row ${isSnippet ? "snippet-row" : "secret-row"} ${item.pinned ? "pinned" : ""} ${isSelected || closing ? "selected" : ""} ${closing ? "closing-row" : ""} ${checked ? "checked" : ""} ${copiedId === item.id ? "copied" : ""} ${copiedReferenceId === item.id ? "reference-copied" : ""} ${cardReorder.draggingId === item.id ? "dragging" : ""} ${cardReorder.overId === item.id && cardReorder.draggingId !== item.id ? "drag-over" : ""}`}>
                    <div className="row-line">
                      {bulkMode
                        ? <button type="button" className={`row-check ${checked ? "on" : ""}`} role="checkbox" aria-checked={checked} aria-label={`选择 ${item.label}`} onClick={() => toggleBulk(item.id)}><Icon name="check" /></button>
                        : <button type="button" className="drag-handle" disabled={!cardDragEnabled} aria-label={`拖动排序 ${item.label}`} title={cardDragEnabled ? "拖动排序，或按 Option 加方向键" : "清除搜索和筛选后可排序"} onPointerDown={(event) => cardReorder.beginPointerDrag(event, item.id)} onKeyDown={(event) => handleCardSortKey(event, item.id)}><i style={{ background: categoryColors[item.folder || ""] || UNCATEGORIZED_COLOR }} /></button>}
                      <button type="button" className="row-main" onClick={(event) => { if (bulkMode || event.metaKey || event.ctrlKey || event.shiftKey) { toggleBulk(item.id); return; } selectRow(index); }} onDoubleClick={() => { if (!bulkMode) void copy(item); }} aria-expanded={bulkMode ? undefined : isSelected} aria-label={bulkMode ? `选择 ${item.label}` : `${isSelected ? "已展开" : "展开"} ${item.label}`}>
                        <span className="row-copy">
                          <span className="row-title">
                            <strong className={isSnippet ? "snippet-label" : undefined}>{isSnippet ? <SnippetTitle label={item.label} query={query} /> : <Highlight text={item.label} query={query} />}</strong>
                            {isSelected && isSnippet && item.snippetNumber && <b className="row-snippet-number">{item.snippetNumber}</b>}
                            {showFolderChip && item.folder && <small className="row-folder">{item.folder}</small>}
                          </span>
                          {!isSelected && isSnippet && <small className="snippet-preview" lang="en"><Highlight text={item.secret} query={query} /></small>}
                        </span>
                      </button>
                      {!isSnippet && !PLAIN_NOTES && <button type="button" className="native-reference" onClick={() => void copySecretReference(item)} aria-label={copiedReferenceId === item.id ? `已复制引用 ${item.label}` : `复制引用 ${item.label}`} title={copiedReferenceId === item.id ? "引用已复制" : "复制引用，发给其他任务"}><span className="reference-glyph" aria-hidden="true" /><span className="reference-check" aria-hidden="true">✓</span></button>}
                      <button type="button" className="native-copy" onClick={() => void copy(item)} aria-label={copiedId === item.id ? `已复制 ${item.label}` : `复制 ${item.label}`} title={copiedId === item.id ? "已复制" : "复制"}><span className="copy-glyph" aria-hidden="true" /><span className="copy-check" aria-hidden="true">✓</span></button>
                      <button type="button" className="native-pin" onClick={() => togglePinned(item)} aria-label={`${item.pinned ? "取消收藏" : "收藏"} ${item.label}`} aria-pressed={Boolean(item.pinned)} title={item.pinned ? "取消收藏" : "收藏"}><Icon name="star" filled={Boolean(item.pinned)} /></button>
                      {copiedId === item.id && <span className="copy-status" role="status" aria-live="polite">已复制</span>}
                      {!PLAIN_NOTES && copiedReferenceId === item.id && <span className="copy-status" role="status" aria-live="polite">引用已复制</span>}
                    </div>
                    {(isSelected || closing) && <div className={`row-detail ${closing ? "closing" : ""}`} inert={closing} aria-hidden={closing || undefined}><div className="row-detail-inner">
                      {isSnippet ? (!fillOpen && <p className="row-content" lang="en"><SnippetContent text={item.secret} query={query} /></p>) : PLAIN_NOTES ? <p className="row-content"><Highlight text={item.secret} query={query} /></p> : (
                        <div className={`row-secret ${revealed ? "revealed" : ""}`}>
                          <span className="row-secret-value">{revealed ? item.secret : "••••••••••••••••"}</span>
                          <button type="button" className="ghost-button reveal-button" aria-pressed={revealed} onPointerDown={() => setRevealedId(item.id)} onPointerUp={() => setRevealedId("")} onPointerLeave={() => setRevealedId("")} onPointerCancel={() => setRevealedId("")} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); setRevealedId(item.id); } }} onKeyUp={() => setRevealedId("")} onBlur={() => setRevealedId("")}><Icon name="eye" />按住显示</button>
                        </div>
                      )}
                      {fillOpen && copyRequest
                        ? <SnippetFillPanel request={copyRequest} onClose={() => setCopyRequest(null)} onCopy={async (text) => { await finishCopy(copyRequest.item, text); setCopyRequest(null); }} />
                        : <div className="row-actions">
                          <button type="button" className="primary-button" onClick={() => void copy(item)}><Icon name={copiedId === item.id ? "check" : "copy"} />{copiedId === item.id ? "已复制" : "复制"}<kbd>↵</kbd></button>
                          {isSnippet && hasOptionalSnippetPreparation(item) && <button type="button" className="secondary-button" onClick={() => prepareCopy(item)}>填写变量</button>}
                          {!isSnippet && !PLAIN_NOTES && <button type="button" className="secondary-button" onClick={() => void copySecretReference(item)} title={`只复制编号，${SECRET_WORD}本身不会出现在聊天或日志里`}><Icon name={copiedReferenceId === item.id ? "check" : "link"} />{copiedReferenceId === item.id ? "引用已复制" : "复制引用"}</button>}
                          <button type="button" className="ghost-button" onClick={() => openEditor(item)}>编辑</button>
                          <span className="spacer" />
                          <div className="menu-wrap">
                            <button type="button" className="icon-button" aria-label={`更多操作 ${item.label}`} aria-expanded={rowMenuId === item.id} onClick={() => setRowMenuId((value) => value === item.id ? "" : item.id)}><Icon name="more" /></button>
                            {rowMenuId === item.id && <div className="dropdown row-menu" role="menu">
                              {moveTargets.length > 0 && <p className="menu-label">移动到</p>}
                              {moveTargets.map((folder) => <button type="button" role="menuitem" key={folder || "uncategorized"} onClick={() => void moveItemToFolder(item, folder)}><i className="menu-dot" aria-hidden="true" style={{ background: folder ? categoryColors[folder] : UNCATEGORIZED_COLOR }} />{folder || "未分类"}</button>)}
                              {moveTargets.length > 0 && <div className="menu-divider" />}
                              <button type="button" role="menuitem" className="danger" onClick={() => { setRowMenuId(""); void trashNow(item); }}>移到回收站</button>
                            </div>}
                          </div>
                        </div>}
                      {!isSnippet && !PLAIN_NOTES && !fillOpen && <p className="row-hint">复制引用只复制编号，交给本机其他任务读取，{SECRET_WORD}本身不会出现在聊天或日志里。</p>}
                    </div></div>}
                  </article>
                );
              })}
            </div>
            {bulkMode && <div className="bulk-bar" role="toolbar" aria-label="批量操作">
              <strong>已选 {bulkCount} 条</strong>
              <button type="button" className="ghost-button" onClick={() => setBulkIds(bulkCount === filtered.length ? [] : filtered.map((item) => item.id))}>{bulkCount === filtered.length ? "全不选" : "全选"}</button>
              <span className="spacer" />
              <div className="menu-wrap">
                <button type="button" className="secondary-button" disabled={bulkCount === 0} aria-expanded={bulkMoveOpen} onClick={() => setBulkMoveOpen((value) => !value)}>移动到<Icon name="chevron" /></button>
                {bulkMoveOpen && <div className="dropdown bulk-menu" role="menu">
                  {[...activeFolders, ...(activeKind === "secret" ? [""] : [])].map((folder) => <button type="button" role="menuitem" key={folder || "uncategorized"} onClick={() => void bulkMoveTo(folder)}><i className="menu-dot" aria-hidden="true" style={{ background: folder ? categoryColors[folder] : UNCATEGORIZED_COLOR }} />{folder || "未分类"}</button>)}
                </div>}
              </div>
              <button type="button" className="secondary-button danger-text" disabled={bulkCount === 0} onClick={() => void bulkTrash()}>移到回收站</button>
              <button type="button" className="primary-button" onClick={exitBulk}>完成</button>
            </div>}
            <footer className="status-bar">
              <span className="spacer" />
              <span><kbd>↑↓</kbd>选择</span>
              <span><kbd>↵</kbd>复制</span>
              <span><Keys k="E" />编辑</span>
            </footer>
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
        onImport={() => { setSettingsOpen(false); fileRef.current?.click(); }}
        onImportSheet={() => { setSettingsOpen(false); spreadsheetFileRef.current?.click(); }}
        onReload={() => { setSettingsOpen(false); void refreshLocalVault(); }}
        onMini={() => { setSettingsOpen(false); requestWindowMode("mini"); }}
      />}
      {deleteRequest && <DeleteConfirmDialog request={deleteRequest} onClose={() => setDeleteRequest(null)} onConfirm={confirmDelete} />}
      {backupMode && <BackupDialog
        mode={backupMode}
        needsPassword={backupMode === "export" || Boolean(pendingImport?.envelope)}
        onClose={() => { setBackupMode(null); if (backupMode === "import") setPendingImport(null); }}
        onExport={exportVault}
        onImport={applyImport}
      />}
      {snippetImport && <SnippetImportDialog preview={snippetImport} fileName={snippetImportName} onClose={() => { setSnippetImport(null); setSnippetImportName(""); }} onImport={applySnippetImport} />}
      {undoTrash && <div className="toast undo-toast" role="status"><span>✓</span>{undoTrash.length > 1 ? `已移入回收站 ${undoTrash.length} 条` : "已移入回收站"}<button type="button" onClick={() => void undoTrashNow()}>撤销</button></div>}
      {toast && !undoTrash && <div className="toast"><span>✓</span>{toast}</div>}
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
          <p className="import-privacy">表格只在本机解析。导入采用合并方式，不会覆盖{SECRET_WORD}或现有话术。</p>
        </div>
        <footer className="snippet-dialog-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button type="button" className="primary" onClick={() => void confirm()} disabled={busy || preview.importableCount === 0}>{busy ? "正在加密写入…" : `导入 ${preview.importableCount} 条话术`}</button></footer>
      </section>
    </div>
  );
}

function SnippetFillPanel({ request, onClose, onCopy }: {
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
  const formRef = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
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
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- delegated Esc / ⌘Enter for the form inside
    <section className="fill-panel" role="group" aria-label={`填写变量 ${request.item.label}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); onClose(); }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); formRef.current?.requestSubmit(); }
      }}>
      <form ref={formRef} onSubmit={submit}>
        {meta.chineseText && <div className="copy-language" role="group" aria-label="复制语言"><button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>英文</button><button type="button" className={language === "zh" ? "active" : ""} onClick={() => setLanguage("zh")}>中文</button></div>}
        {meta.placeholders.length > 0 && <fieldset className="copy-fields"><legend>填写正文变量</legend>{meta.placeholders.map((placeholder, index) => <label key={placeholder}><span>{placeholder}</span><input ref={index === 0 ? firstRef : undefined} value={values[placeholder] || ""} onChange={(event) => setValues((current) => ({ ...current, [placeholder]: event.target.value }))} placeholder={`输入 ${placeholder}`} /></label>)}</fieldset>}
        {meta.requiredInputs.length > 0 && <fieldset className="copy-checks"><legend>发送前确认</legend>{meta.requiredInputs.map((input) => <label key={input}><input type="checkbox" checked={checkedInputs.includes(input)} onChange={(event) => setCheckedInputs((current) => event.target.checked ? [...current, input] : current.filter((value) => value !== input))} /><span>已确认 {input}</span></label>)}</fieldset>}
        {meta.requiresVerification && <label className="copy-warning"><input type="checkbox" checked={verificationConfirmed} onChange={(event) => setVerificationConfirmed(event.target.checked)} /><span><strong>发送前核实</strong> 金额、库存、地址或时效已按当前情况检查</span></label>}
        <section className="copy-preview"><h3>{language === "en" ? "英文预览" : "中文预览"}</h3><p lang={language === "en" ? "en" : "zh"}>{filled.text}</p></section>
        <div className="fill-actions"><button type="button" className="ghost-button" onClick={onClose} disabled={busy}>取消</button><button type="submit" className="primary-button" disabled={busy || !readiness.ready || !source}>{busy ? "正在复制…" : `复制${language === "en" ? "英文" : "中文"}`}<Keys k="↵" /></button></div>
      </form>
    </section>
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
          <p className="backup-intro">{mode === "export" ? `只备份话术，并使用独立密码加密；${SECRET_WORD}不会包含在文件中。` : needsPassword ? "先验证备份密码，验证成功后才会写入本机数据。" : "已识别旧版备份。导入前仍可选择合并或覆盖。"}</p>
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

type SettingsFolderGroup = { kind: ItemKind; title: string; folders: { name: string; count: number; color: string; locked: boolean }[] };

function SettingsFolders({ groups, onAdd, onRename, onDelete, onColor, onMove, onReorder }: {
  groups: SettingsFolderGroup[];
  onAdd: (kind: ItemKind, name: string) => Promise<string>;
  onRename: (kind: ItemKind, from: string, to: string) => Promise<string>;
  onDelete: (kind: ItemKind, folder: string) => Promise<string>;
  onColor: (kind: ItemKind, folder: string, color: string | null) => void;
  onMove: (kind: ItemKind, folder: string, delta: -1 | 1) => void;
  onReorder: (kind: ItemKind, source: string, target: string) => void;
}) {
  const { prepareSortAnimation } = useSortFlipAnimation();
  // Row ids are "<kind>:<name>"; a drag only counts when both rows belong to the same list.
  const reorder = usePointerReorder({
    enabled: true,
    scope: "settings-folder",
    onDrop: (sourceId, targetId) => {
      const kind = sourceId.slice(0, sourceId.indexOf(":")) as ItemKind;
      if (targetId.slice(0, targetId.indexOf(":")) !== kind) return;
      prepareSortAnimation("settings-folder");
      onReorder(kind, sourceId.slice(kind.length + 1), targetId.slice(kind.length + 1));
    },
  });
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const [adding, setAdding] = useState<{ kind: ItemKind; value: string } | null>(null);
  const [colorKey, setColorKey] = useState("");
  const [armKey, setArmKey] = useState("");
  const [error, setError] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const editingKey = editing?.key;
  const addingKind = adding?.kind;
  useEffect(() => { if (editingKey) { editRef.current?.focus(); editRef.current?.select(); } }, [editingKey]);
  useEffect(() => { if (addingKind) addRef.current?.focus(); }, [addingKind]);

  async function finish(task: Promise<string>, done: () => void) {
    const failure = await task;
    setError(failure);
    if (!failure) done();
  }

  return (
    <div className="settings-folders">
      {groups.map((group) => (
        <div className="settings-folder-group" key={group.kind}>
          <div className="settings-folder-head"><strong>{group.title}</strong>
            <button type="button" className="secondary-button" onClick={() => { setError(""); setAdding({ kind: group.kind, value: "" }); }}>新建目录</button>
          </div>
          {adding?.kind === group.kind && (
            <form className="settings-folder-form" data-local-esc onSubmit={(event) => { event.preventDefault(); void finish(onAdd(group.kind, adding.value), () => setAdding(null)); }}>
              <input ref={addRef} value={adding.value} maxLength={30} placeholder="目录名称" aria-label={`新建${group.title}`} onChange={(event) => setAdding({ kind: group.kind, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setAdding(null); setError(""); } }} />
              <button type="submit" className="secondary-button">创建</button>
              <button type="button" className="secondary-button" onClick={() => { setAdding(null); setError(""); }}>取消</button>
            </form>
          )}
          {group.folders.length === 0 && <p className="settings-note">还没有目录</p>}
          {group.folders.map((folder, index) => {
            const key = `${group.kind}:${folder.name}`;
            const previous = group.folders[index - 1];
            const next = group.folders[index + 1];
            return (
              <div className={`settings-folder ${reorder.draggingId === key ? "dragging" : ""} ${reorder.overId === key && reorder.draggingId !== key ? "drag-over" : ""}`} key={key} {...(folder.locked ? {} : { "data-sort-scope": "settings-folder", "data-sort-id": key })}>
                <div className="settings-folder-row">
                  {folder.locked || editing?.key === key
                    ? <span className="settings-folder-grip placeholder" aria-hidden="true" />
                    : <button type="button" className="settings-folder-grip" aria-label={`拖动排序 ${folder.name}`} title="按住拖动排序" onPointerDown={(event) => reorder.beginPointerDrag(event, key)}><span aria-hidden="true">⠿</span></button>}
                  <button type="button" className="settings-folder-dot" style={{ background: folder.color }} aria-label={`修改颜色 ${folder.name}`} aria-expanded={colorKey === key} onClick={() => setColorKey(colorKey === key ? "" : key)} />
                  {editing?.key === key ? (
                    <form className="settings-folder-form" data-local-esc onSubmit={(event) => { event.preventDefault(); void finish(onRename(group.kind, folder.name, editing.value), () => setEditing(null)); }}>
                      <input ref={editRef} value={editing.value} maxLength={30} aria-label={`重命名 ${folder.name}`} onChange={(event) => setEditing({ key, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setEditing(null); setError(""); } }} />
                      <button type="submit" className="secondary-button">保存</button>
                      <button type="button" className="secondary-button" onClick={() => { setEditing(null); setError(""); }}>取消</button>
                    </form>
                  ) : (
                    <>
                      <span className="settings-folder-name" title={folder.name}>{folder.name}</span>
                      <small className="settings-folder-count">{folder.count} 条</small>
                      {folder.locked ? <span className="settings-folder-fixed" title="标准话术目录不能改名或删除">固定</span> : <span className="settings-folder-actions">
                        <button type="button" className="settings-mini-button" aria-label={`上移 ${folder.name}`} title="上移" disabled={folder.locked || !previous || previous.locked} onClick={() => onMove(group.kind, folder.name, -1)}>↑</button>
                        <button type="button" className="settings-mini-button" aria-label={`下移 ${folder.name}`} title="下移" disabled={folder.locked || !next || next.locked} onClick={() => onMove(group.kind, folder.name, 1)}>↓</button>
                        <button type="button" className="settings-mini-button" disabled={folder.locked} title={folder.locked ? "标准话术目录不能改名" : undefined} onClick={() => { setError(""); setArmKey(""); setEditing({ key, value: folder.name }); }}>改名</button>
                        {armKey === key
                          ? <button type="button" className="settings-mini-button danger" onClick={() => { setArmKey(""); void finish(onDelete(group.kind, folder.name), () => undefined); }}>{group.kind === "secret" && folder.count > 0 ? `确认删除（${folder.count} 条移到未分类）` : "确认删除"}</button>
                          : <button type="button" className="settings-mini-button danger" disabled={folder.locked} title={folder.locked ? "标准话术目录不能删除" : undefined} onClick={() => { setError(""); setArmKey(key); }}>删除</button>}
                      </span>}
                    </>
                  )}
                </div>
                {colorKey === key && (
                  <div className="settings-swatches" role="group" aria-label={`${folder.name} 的颜色`}>
                    <button type="button" className="settings-mini-button" onClick={() => onColor(group.kind, folder.name, null)}>自动</button>
                    {CATEGORY_PALETTE.map((color) => <button key={color} type="button" aria-label={`颜色 ${color}`} aria-pressed={folder.color.toLowerCase() === color.toLowerCase()} className={folder.color.toLowerCase() === color.toLowerCase() ? "on" : ""} style={{ background: color }} onClick={() => onColor(group.kind, folder.name, color)} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {error && <p className="settings-error" role="alert">{error}</p>}
      <p className="settings-note">标准话术目录固定，只能改颜色。话术目录里还有内容时不能删除；{SECRET_WORD}目录删除后，里面的内容会移到未分类。</p>
    </div>
  );
}

function backupAgeLabel(at: number) {
  if (!at) return "还没有导出过";
  const days = Math.floor((Date.now() - at) / 86_400_000);
  const clock = new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return `上次导出 ${clock}${days >= 1 ? `（${days} 天前）` : ""}`;
}

function AiSettingsSection({ localAiAvailable }: { localAiAvailable: boolean }) {
  const [form, setForm] = useState<AiSettings>(() => readAiSettings(localStorage) || { baseUrl: "", model: "", polishPrompt: DEFAULT_AI_PROMPTS.polish, organizePrompt: DEFAULT_AI_PROMPTS.organize });
  const [keyInput, setKeyInput] = useState("");
  const [status, setStatus] = useState<AiKeyStatus>({ hasKey: false, origin: "" });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [savedSettings, setSavedSettings] = useState<AiSettings | null>(() => readAiSettings(localStorage));
  useEffect(() => {
    let cancelled = false;
    aiKeyStatus().then((value) => { if (!cancelled) setStatus(value); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const origin = parseAiEndpoint(form.baseUrl)?.origin || "";
  const keyReady = keyInput.trim().length > 0 || (status.hasKey && status.origin === origin);
  const problem = validateAiSettings(form, keyReady);
  const active = Boolean(savedSettings) && status.hasKey;
  const edit = (patch: Partial<AiSettings>) => { setForm((value) => ({ ...value, ...patch })); setTouched(true); setMessage(null); };

  async function save() {
    if (problem || busy) return false;
    setBusy("save");
    try {
      const next = await aiKeySave(form.baseUrl.trim(), keyInput);
      const clean: AiSettings = { baseUrl: form.baseUrl.trim(), model: form.model.trim(), polishPrompt: form.polishPrompt.trim(), organizePrompt: form.organizePrompt.trim() };
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(clean));
      setForm(clean);
      setSavedSettings(clean);
      setStatus(next);
      setKeyInput("");
      setTouched(false);
      setMessage({ tone: "ok", text: "已保存，AI 润色和 AI 整理会使用这个接口" });
      return true;
    } catch (error) {
      setMessage({ tone: "error", text: aiErrorText(error) });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function testConnection() {
    if (problem || busy) return;
    if (!(await save())) return;
    setBusy("test");
    setMessage({ tone: "ok", text: "正在测试…" });
    const reply = await aiChat({ ...form, baseUrl: form.baseUrl.trim(), model: form.model.trim() }, "你是连接测试。只回复 OK。", "ping");
    setBusy("");
    setMessage(reply.error ? { tone: "error", text: `连接失败：${reply.error}` } : { tone: "ok", text: "连接成功，接口可以使用" });
  }

  async function clearInterface() {
    setBusy("save");
    try { await aiKeyClear(); } catch { /* the settings below are cleared either way */ }
    localStorage.removeItem(AI_SETTINGS_KEY);
    setSavedSettings(null);
    setStatus({ hasKey: false, origin: "" });
    setForm({ baseUrl: "", model: "", polishPrompt: DEFAULT_AI_PROMPTS.polish, organizePrompt: DEFAULT_AI_PROMPTS.organize });
    setKeyInput("");
    setTouched(false);
    setBusy("");
    setMessage({ tone: "ok", text: "已停用并清除接口和密钥" });
  }

  const summary = active && savedSettings
    ? `已启用自己的 AI 接口：${parseAiEndpoint(savedSettings.baseUrl)?.host || savedSettings.baseUrl} · ${savedSettings.model}`
    : localAiAvailable ? "已检测到系统自带的本机 AI，文字不会离开这台电脑" : "还没有设置接口：AI 整理会用规则整理，AI 润色需要填写下面的接口";
  return (
    <>
      <div className="settings-row static"><div><strong>AI 润色 / AI 整理</strong><small>{summary}</small></div></div>
      <form className="settings-ai-form" onSubmit={(event) => { event.preventDefault(); void save(); }} autoComplete="off">
        <label className="settings-ai-field"><span>接口地址</span><input value={form.baseUrl} onChange={(event) => edit({ baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" spellCheck={false} /></label>
        <div className="settings-ai-pair">
          <label className="settings-ai-field"><span>模型</span><input value={form.model} onChange={(event) => edit({ model: event.target.value })} placeholder="例如 gpt-4o-mini" spellCheck={false} /></label>
          <label className="settings-ai-field"><span>API Key</span><input type="password" value={keyInput} onChange={(event) => { setKeyInput(event.target.value); setTouched(true); setMessage(null); }} placeholder={status.hasKey ? "已保存，留空则保持不变" : "sk-…"} spellCheck={false} autoComplete="new-password" /></label>
        </div>
        <label className="settings-ai-field"><span>润色提示词</span><textarea rows={4} value={form.polishPrompt} onChange={(event) => edit({ polishPrompt: event.target.value })} aria-invalid={!form.polishPrompt.trim()} /></label>
        <label className="settings-ai-field"><span>整理提示词</span><textarea rows={4} value={form.organizePrompt} onChange={(event) => edit({ organizePrompt: event.target.value })} aria-invalid={!form.organizePrompt.trim()} /></label>
        {(touched && problem) && <p className="settings-error" role="alert">{problem}</p>}
        {message && <p className={message.tone === "error" ? "settings-error" : "settings-ok"} role="status">{message.text}</p>}
        <div className="settings-ai-actions">
          <button type="submit" className="primary-button" disabled={Boolean(problem) || Boolean(busy)}>{busy === "save" ? "保存中…" : "保存"}</button>
          <button type="button" className="secondary-button" disabled={Boolean(problem) || Boolean(busy)} onClick={() => void testConnection()}>{busy === "test" ? "测试中…" : "保存并测试"}</button>
          <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => { setForm((value) => ({ ...value, polishPrompt: DEFAULT_AI_PROMPTS.polish, organizePrompt: DEFAULT_AI_PROMPTS.organize })); setTouched(true); setMessage(null); }}>恢复默认提示词</button>
          <span className="spacer" />
          {(savedSettings || status.hasKey) && <button type="button" className="secondary-button danger-text" disabled={Boolean(busy)} onClick={() => void clearInterface()}>停用并清除</button>}
        </div>
      </form>
      <p className="settings-note">接口需兼容 OpenAI 的 chat/completions 格式（也可填写本机地址，如 http://localhost:11434/v1）。API Key 由系统加密后只保存在这台电脑，不会进入备份；点“润色/整理”时，话术内容会发送到你填写的接口。提示词不能为空。</p>
    </>
  );
}

function SettingsDialog({ version, isDesktop, refreshing, itemCount, trashCount, miniHidePolicy, onMiniHidePolicy, folderGroups, onFolderAdd, onFolderRename, onFolderDelete, onFolderColor, onFolderMove, onFolderReorder, closeBehavior, onCloseBehavior, trashDays, onTrashDays, onEmptyTrash, theme, onTheme, lastBackupAt, onOpenDataFolder, onClose, onExport, onImport, onImportSheet, onReload, onMini }: {
  version: string; isDesktop: boolean; refreshing: boolean; itemCount: number; trashCount: number;
  miniHidePolicy: MiniHidePolicy; onMiniHidePolicy: (policy: MiniHidePolicy) => void;
  folderGroups: SettingsFolderGroup[];
  onFolderAdd: (kind: ItemKind, name: string) => Promise<string>;
  onFolderRename: (kind: ItemKind, from: string, to: string) => Promise<string>;
  onFolderDelete: (kind: ItemKind, folder: string) => Promise<string>;
  onFolderColor: (kind: ItemKind, folder: string, color: string | null) => void;
  onFolderMove: (kind: ItemKind, folder: string, delta: -1 | 1) => void;
  onFolderReorder: (kind: ItemKind, source: string, target: string) => void;
  closeBehavior: CloseBehavior; onCloseBehavior: (behavior: CloseBehavior) => void;
  trashDays: number; onTrashDays: (days: number) => void; onEmptyTrash: () => Promise<void>;
  theme: ThemeChoice; onTheme: (theme: ThemeChoice) => void; lastBackupAt: number; onOpenDataFolder: () => void;
  onClose: () => void; onExport: () => void; onImport: () => void; onImportSheet: () => void; onReload: () => void; onMini: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [versionCopied, setVersionCopied] = useState(false);
  const [aiAvailable] = useState(() => typeof window !== "undefined" && "LanguageModel" in window);
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    window.clipboxDesktop?.getLaunchAtLogin?.().then((value) => { if (!cancelled) setLaunchAtLogin(value); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  // onClose is a fresh closure on every render of the page, so keep it in a ref:
  // re-running the effect would pull focus back to the close button mid-typing.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { if ((event.target as HTMLElement | null)?.closest?.("[data-local-esc]") || document.querySelector(".settings-folder.dragging")) return; event.stopPropagation(); onCloseRef.current(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const row = (title: string, hint: string, action: () => void, label: string, disabled = false) => (
    <div className="settings-row"><div><strong>{title}</strong><small>{hint}</small></div><button type="button" className="secondary-button" onClick={action} disabled={disabled}>{label}</button></div>
  );
  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header><h2 id="settings-title">设置</h2><button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="关闭设置">×</button></header>
        <div className="settings-body">
          <section aria-labelledby="set-data"><h3 id="set-data">数据</h3>
            {row("导出话术备份", `用独立密码加密，不包含${SECRET_WORD} · ${backupAgeLabel(lastBackupAt)}`, onExport, "导出…")}
            {row("导入备份", "支持新旧版备份，可选择合并或覆盖", onImport, "选择文件…")}
            {row("导入话术表格", "读取 .xlsx / .csv，只在本机解析", onImportSheet, "选择表格…")}
            {row("重新加载", "重新读取本地数据，不会改动内容", onReload, refreshing ? "加载中…" : "重新加载", refreshing)}
            {isDesktop
              ? row("数据位置", "在文件夹中打开 Clipbox 的本机数据", onOpenDataFolder, "打开文件夹")
              : <div className="settings-row static"><div><strong>数据位置</strong><small>浏览器版保存在本站点的本地存储里，清除站点数据会一并删除</small></div></div>}
          </section>
          <section aria-labelledby="set-folders"><h3 id="set-folders">目录</h3>
            <SettingsFolders groups={folderGroups} onAdd={onFolderAdd} onRename={onFolderRename} onDelete={onFolderDelete} onColor={onFolderColor} onMove={onFolderMove} onReorder={onFolderReorder} />
          </section>
          <section aria-labelledby="set-look"><h3 id="set-look">外观</h3>
            <div className="settings-row"><div><strong>主题</strong><small>跟随系统会随系统的深浅色设置自动切换</small></div>
              <div className="settings-segment" role="radiogroup" aria-label="主题">
                {([["system", "跟随系统"], ["light", "浅色"], ["dark", "深色"]] as [ThemeChoice, string][]).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={theme === value} className={theme === value ? "active" : ""} onClick={() => onTheme(value)}>{label}</button>)}
              </div>
            </div>
          </section>
          <section aria-labelledby="set-security"><h3 id="set-security">安全</h3>
            <p className="settings-note">条目使用 AES-GCM 加密保存在本机，密钥由设备密钥与 PBKDF2 派生。{SECRET_WORD}不会进入话术备份{PLAIN_NOTES ? "。" : `，复制${SECRET_WORD}默认只给出引用。`}</p>
          </section>
          <section aria-labelledby="set-trash"><h3 id="set-trash">回收站</h3>
            <div className="settings-row"><div><strong>自动清理</strong><small>超过期限的已删除内容会被永久删除</small></div>
              <div className="settings-segment" role="radiogroup" aria-label="回收站自动清理">
                {TRASH_DAY_OPTIONS.map((days) => <button key={days} type="button" role="radio" aria-checked={trashDays === days} className={trashDays === days ? "active" : ""} onClick={() => onTrashDays(days)}>{days === 0 ? "不清理" : `${days} 天`}</button>)}
              </div>
            </div>
            <div className="settings-row"><div><strong>清空回收站</strong><small>{trashCount === 0 ? "回收站是空的" : `永久删除 ${trashCount} 条，无法恢复`}</small></div>
              {confirmEmpty
                ? <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => setConfirmEmpty(false)}>取消</button><button type="button" className="secondary-button danger" onClick={() => { setConfirmEmpty(false); void onEmptyTrash(); }}>确认清空</button></div>
                : <button type="button" className="secondary-button" disabled={trashCount === 0} onClick={() => setConfirmEmpty(true)}>清空…</button>}
            </div>
          </section>
          <section aria-labelledby="set-window"><h3 id="set-window">窗口</h3>
            {row("迷你模式", "360×440，置顶显示，适合边聊边复制", onMini, "切换到迷你")}
            <div className="settings-row"><div><strong>迷你窗口复制后</strong><small>{isDesktop ? "选择复制后是否自动收起迷你窗口" : "仅桌面版生效"}</small></div>
              <div className="settings-segment" role="radiogroup" aria-label="迷你窗口复制后">
                {([["hotkey", "快捷键呼出时收起"], ["always", "总是收起"], ["never", "不收起"]] as [MiniHidePolicy, string][]).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={miniHidePolicy === value} className={miniHidePolicy === value ? "active" : ""} onClick={() => onMiniHidePolicy(value)}>{label}</button>)}
              </div>
            </div>
            {isDesktop && launchAtLogin !== null && <div className="settings-row"><div><strong>开机自动启动</strong><small>登录系统后自动启动，并安静地收在托盘里</small></div>
              <div className="settings-segment" role="radiogroup" aria-label="开机自动启动">
                {([[false, "关"], [true, "开"]] as [boolean, string][]).map(([value, label]) => <button key={label} type="button" role="radio" aria-checked={launchAtLogin === value} className={launchAtLogin === value ? "active" : ""} onClick={() => { void window.clipboxDesktop?.setLaunchAtLogin?.(value).then(setLaunchAtLogin).catch(() => undefined); }}>{label}</button>)}
              </div>
            </div>}
            {isDesktop && <div className="settings-row"><div><strong>点击窗口关闭按钮时</strong><small>{closeBehavior === "tray" ? "Clipbox 继续在托盘里运行，可随时呼出" : "直接退出 Clipbox"}</small></div>
              <div className="settings-segment" role="radiogroup" aria-label="点击窗口关闭按钮时">
                {([["tray", "收到托盘"], ["quit", "退出"]] as [CloseBehavior, string][]).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={closeBehavior === value} className={closeBehavior === value ? "active" : ""} onClick={() => onCloseBehavior(value)}>{label}</button>)}
              </div>
            </div>}
            <p className="settings-note">完整窗口最小 680×620，可拖大；迷你窗口固定 360×440。</p>
          </section>
          <section aria-labelledby="set-ai"><h3 id="set-ai">AI</h3>
            <AiSettingsSection localAiAvailable={aiAvailable} />
          </section>
          <section aria-labelledby="set-about"><h3 id="set-about">关于</h3>
            <div className="settings-row"><div><strong>Clipbox {version ? `v${version}` : "开发版本"}</strong><small>{itemCount} 条内容 · 回收站 {trashCount} 条 · 数据仅保存在本机</small></div>
              <button type="button" className="secondary-button" onClick={() => { void navigator.clipboard?.writeText(`Clipbox ${version || "dev"} · ${navigator.userAgent}`).then(() => setVersionCopied(true)).catch(() => undefined); }}>{versionCopied ? "已复制" : "复制版本信息"}</button></div>
          </section>
        </div>
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
  const [segmentedSecret, setSegmentedSecret] = useState(kind === "secret" && !PLAIN_NOTES && Boolean(item?.secretSegments));
  const [summary, setSummary] = useState(item?.summary || "");
  const [chineseText, setChineseText] = useState(item?.snippetMeta?.chineseText || "");
  const [rawProduct, setRawProduct] = useState(item?.snippetMeta?.rawProduct || "");
  const [usageNote, setUsageNote] = useState(item?.snippetMeta?.usageNote || "");
  const [referenceNote, setReferenceNote] = useState(kind === "secret" ? item?.note || "" : "");
  const [aiNotice, setAiNotice] = useState("");
  const [aiUndo, setAiUndo] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [referenceStatus, setReferenceStatus] = useState<"idle" | "copied" | "error">("idle");
  const [folder, setFolder] = useState(resolveSelectedFolder(folders, item?.folder || defaultFolder || (kind === "snippet" ? STANDARD_SNIPPET_FOLDERS[0] : ""), kind === "secret"));
  const [color] = useState(item?.color || (kind === "snippet" ? "#ffcfa8" : COLORS[0]));
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState<AiRewriteMode | null>(null);
  const [visible, setVisible] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const copyOnSubmitRef = useRef(false);
  const latestContentRef = useRef(secret);

  useEffect(() => {
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, []);

  useEffect(() => {
    dialogRef.current?.scrollIntoView({ block: "nearest" });
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
    const nextSummary = kind === "snippet" ? (structured ? summary.trim() : limitChars(summary, SNIPPET_NOTE_MAX)) : "";
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

  async function rewrite(mode: AiRewriteMode) {
    const captured = latestContentRef.current;
    if (!captured.trim() || aiBusy) return;
    setAiBusy(mode);
    setAiNotice("");
    try {
      const generated = await aiRewrite(mode, captured);
      if (generated.error) { setAiNotice(generated.error); return; }
      if (generated.unavailable) {
        setAiNotice("还没有可用的 AI：请在 设置 → AI 里填写自己的接口，才能润色；「AI 整理」仍可使用");
        return;
      }
      const result = resolveAiRewrite(captured, latestContentRef.current, generated.text);
      if (result.stale) return;
      if (result.error) { setAiNotice(result.error); return; }
      setAiUndo(captured);
      latestContentRef.current = result.text;
      setSecret(result.text);
      setAiNotice(mode === "polish" ? "已润色" : "已整理");
    } finally {
      setAiBusy(null);
    }
  }

  function undoRewrite() {
    if (aiUndo === null) return;
    latestContentRef.current = aiUndo;
    setSecret(aiUndo);
    setAiUndo(null);
    setAiNotice("");
  }

  return (
    <section ref={dialogRef} className="inline-editor" role="group" aria-label={item ? `编辑 ${item.label}` : kind === "secret" ? `添加${SECRET_WORD}` : "添加话术"}>
      <header className="inline-editor-head">
        <div className={`editor-kind ${kind}`}>
          <span>{item ? "编辑" : "新增"}{kind === "secret" ? SECRET_WORD : "话术"}</span>
          {kind === "snippet" && item?.snippetNumber && <b className="editor-snippet-number">{item.snippetNumber}</b>}
          {kind === "secret" && !PLAIN_NOTES && item && <button type="button" className={`editor-reference ${referenceStatus}`} onClick={() => void copyEditorReference()} disabled={busy} aria-live="polite">{referenceStatus === "copied" ? "已复制" : referenceStatus === "error" ? "复制失败" : "复制引用"}</button>}
        </div>
        <span className="inline-editor-hint">{kind === "secret" ? (PLAIN_NOTES ? "加密保存在这台电脑上" : "加密保存在这台设备上") : structured ? "中英文和使用规则一起加密保存" : "小提示只给自己看；内容可用 AI 润色或整理"}</span>
      </header>
      <form ref={formRef} onSubmit={submit}>
          <div className="editor-body">
            <div className="editor-meta-grid">
              <label className="native-field"><span>{structured ? "具体场景" : "标题"}</span><div className="soft-input"><input ref={titleInputRef} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === "secret" ? (PLAIN_NOTES ? "例如 常用地址" : "例如 prod-ssh") : "例如 售后夸赞"} maxLength={60} /></div></label>
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

            {kind === "secret" && !PLAIN_NOTES && <label className="native-field reference-note-field"><span>被什么引用 <small>可选</small></span><div className="soft-input"><input value={referenceNote} onChange={(event) => setReferenceNote(event.target.value)} placeholder="例如 Shopify API、订单同步任务" maxLength={120} /></div></label>}

            {kind === "secret" && !PLAIN_NOTES && <div className="segmented" role="group" aria-label="内容显示方式">
              <button type="button" className={!visible ? "active" : ""} aria-pressed={!visible} onClick={() => setVisible(false)}>隐藏内容</button>
              <button type="button" className={visible ? "active" : ""} aria-pressed={visible} onClick={() => setVisible(true)}>明文显示</button>
            </div>}

            <div className={`native-field content-field ${kind === "snippet" ? "snippet-content" : ""}`}><span className="content-field-head"><span>{kind === "secret" ? (PLAIN_NOTES ? "备注内容" : "密码 / 文本") : "话术内容"}</span>{kind === "secret" && !PLAIN_NOTES && <button type="button" className={segmentedSecret ? "segment-toggle active" : "segment-toggle"} aria-pressed={segmentedSecret} onClick={toggleSecretSegments}>{segmentedSecret ? "合并" : "分段"}</button>}{kind === "snippet" && <span className="ai-actions">{aiUndo !== null && <button type="button" className="segment-toggle ai-undo" onClick={undoRewrite} disabled={Boolean(aiBusy)}>撤销</button>}<button type="button" className="segment-toggle" onClick={() => void rewrite("polish")} disabled={Boolean(aiBusy) || !secret.trim()}>{aiBusy === "polish" ? "润色中…" : "AI 润色"}</button><button type="button" className="segment-toggle" onClick={() => void rewrite("organize")} disabled={Boolean(aiBusy) || !secret.trim()}>{aiBusy === "organize" ? "整理中…" : "AI 整理"}</button></span>}</span><div className={`soft-textarea ${segmentedSecret ? "secret-segmented" : ""}`}>{segmentedSecret ? <><textarea aria-label={`${SECRET_WORD}第一段`} className={!visible ? "masked" : ""} value={secretParts[0]} onChange={(event) => updateSecretPart(0, event.target.value)} placeholder="第一段" rows={2} /><textarea aria-label={`${SECRET_WORD}第二段`} className={!visible ? "masked" : ""} value={secretParts[1]} onChange={(event) => updateSecretPart(1, event.target.value)} placeholder="第二段" rows={2} /></> : <textarea aria-label={kind === "secret" ? (PLAIN_NOTES ? "备注内容" : "密码 / 文本") : "话术内容"} className={kind === "secret" && !PLAIN_NOTES && !visible ? "masked" : ""} value={secret} onChange={(event) => { latestContentRef.current = event.target.value; setSecret(event.target.value); setAiNotice(""); setAiUndo(null); }} placeholder={kind === "secret" ? (PLAIN_NOTES ? "输入要保存的备注内容" : "输入要保存的密码或文本") : "输入需要反复使用的话术"} rows={6} />}</div></div>

            {kind === "snippet" && aiNotice && <small className="ai-notice" role="status">{aiNotice}</small>}

            {kind === "snippet" && <div className="native-field summary-field">
              <label htmlFor="summary-input">{structured ? "核心动作" : "小提示"} {!structured && <small>可选，最多 {SNIPPET_NOTE_MAX} 字</small>}</label>
              <div className="summary-control">
                <input id="summary-input" value={summary} onChange={(event) => setSummary(structured ? event.target.value : limitChars(event.target.value, SNIPPET_NOTE_MAX))} placeholder={structured ? "例如 发送睫毛报价" : "例如 售后夸赞时用"} />
              </div>
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
            <div>{onDelete && <button type="button" className="delete-entry" onClick={() => void onDelete()}>移到回收站</button>}</div>
            <div className="editor-actions"><button type="button" className="editor-cancel" onClick={onClose} disabled={busy}>取消</button><button className={`editor-save ${structured ? "" : "secondary"}`} disabled={busy || !label.trim() || !secret}>{busy ? "正在保存…" : "保存"}</button>{!structured && <button className="editor-save" onClick={() => { copyOnSubmitRef.current = true; }} disabled={busy || !label.trim() || !secret}>{busy ? "正在保存…" : "保存并复制"}</button>}</div>
          </footer>
      </form>
    </section>
  );
}
