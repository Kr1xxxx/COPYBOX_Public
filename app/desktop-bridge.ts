import type { CloseBehavior, MiniHidePolicy, ThemeChoice } from "./preferences";

// `installable` is false when 立即更新 cannot work here (no checksum in the manifest, or not Windows); older shells omit it.
export type UpdateInfo = { status: "disabled" | "current" | "error" } | { status: "available"; version: string; notes: string[]; installable?: boolean };

export type UpdateInstallResult =
  | { status: "installing" | "busy" }
  | { status: "error"; reason: "network" | "incomplete" | "disk" | "start" | "unavailable" | string };

export type UpdateProgress = { received: number; total: number };

export type WindowMode = "full" | "mini";

export type ClipboxDesktop = {
  platform?: string;
  // Only the web preview sets this: it shows 导入测试内容 / 清除测试内容 in 设置 → 数据. The real app never does.
  testTools?: boolean;
  copyText: (text: string) => Promise<void>;
  copyImage?: (png: Uint8Array) => Promise<void>;
  // TinyPNG compression done by the desktop shell; resolves with the smaller picture or the reason it failed.
  compressImage?: (bytes: Uint8Array, key: string) => Promise<{ ok: true; bytes: Uint8Array } | { ok: false; reason: string }>;
  // Automatic daily backup files kept in the data folder (newest seven); the page decides what goes in a file.
  backupSave?: (name: string, bytes: Uint8Array) => Promise<void>;
  backupList?: () => Promise<{ name: string; size: number }[]>;
  backupRead?: (name: string) => Promise<Uint8Array>;
  // The pictures of those backups, one file each (`<sha-256>.bin` in backups/images/), shared by all the days (D-043).
  backupImageSave?: (name: string, bytes: Uint8Array) => Promise<void>;
  backupImageList?: () => Promise<{ name: string; size: number }[]>;
  backupImageRead?: (name: string) => Promise<Uint8Array>;
  // Removes every picture file not named in `keep`.
  backupImagePrune?: (keep: string[]) => Promise<void>;
  didCopy: () => void;
  setMiniHidePolicy?: (policy: MiniHidePolicy) => void;
  // Windows only (D-078): the mini window sticks to a screen edge and folds away while the mouse is elsewhere.
  setMiniEdgeSnap?: (on: boolean) => void;
  setCloseBehavior?: (behavior: CloseBehavior) => void;
  getLaunchAtLogin?: () => Promise<boolean>;
  setLaunchAtLogin?: (enabled: boolean) => Promise<boolean>;
  setTheme?: (theme: ThemeChoice) => void;
  openDataFolder?: () => Promise<string>;
  getVersion: () => Promise<string>;
  // When this build was made or last updated, as an ISO date string.
  getBuildTime?: () => Promise<string>;
  checkUpdate?: () => Promise<UpdateInfo>;
  openUpdate?: () => Promise<boolean>;
  // Downloads, checks and installs the version the last check found; the app then closes and opens the new one.
  installUpdate?: () => Promise<UpdateInstallResult>;
  onUpdateProgress?: (callback: (progress: UpdateProgress) => void) => () => void;
  // Windows only (D-053): the vault's device key in Credential Manager; get gives null when none is stored yet.
  deviceKeyGet?: () => Promise<string | null>;
  deviceKeySet?: (key: string) => Promise<void>;
  // Windows only (D-057): the own TinyPNG keys and the 企业同步码 in Credential Manager; get gives null when none is stored.
  secretGet?: (name: string) => Promise<string | null>;
  secretSet?: (name: string, value: string) => Promise<void>;
  secretDelete?: (name: string) => Promise<void>;
  aiStatus?: () => Promise<{ hasKey: boolean; origin: string }>;
  aiSave?: (settings: { baseUrl: string; key: string }) => Promise<{ hasKey: boolean; origin: string }>;
  aiClear?: () => Promise<{ hasKey: boolean; origin: string }>;
  aiRequest?: (payload: { url: string; body?: unknown; method?: "GET" | "POST" }) => Promise<{ ok: boolean; status: number; text: string }>;
  fetchSharedLibrary?: (url: string) => Promise<string>;
  // 登录同步 (D-064): one request to https://copyboxx.com/api/…, sent by the shell. Older shells lack it.
  cloudRequest?: (request: { method: "GET" | "POST" | "PUT" | "DELETE"; path: string; body?: unknown; token?: string }) => Promise<{ status: number; text: string }>;
  // Only the web preview (and tests) set this: 登录同步 then talks to a pretend server in the page (cloud-demo.ts).
  cloudDemo?: boolean;
  // The site's own small icon as a data: URL, or "" when it has none.
  fetchSiteIcon?: (host: string) => Promise<string>;
  relaunch: () => void;
  onFocusSearch: (callback: () => void) => () => void;
  onFlushRequest?: (callback: () => void) => () => void;
  flushDone?: () => void;
  // caller: who asked ({ name, id }), or null when the shell could not tell (D-059).
  onAutomationCommand: (callback: (request: { requestId: string; command: unknown; caller?: unknown }) => void) => () => void;
  respondAutomationCommand: (requestId: string, response: unknown) => void;
  automationReady: () => void;
  // The program AI tools start as Copyboxx's MCP server (`<path> --mcp`, D-060); older shells lack it.
  mcpProgramPath?: () => Promise<string | null>;
  setWindowMode?: (mode: WindowMode) => void;
  // 固定在最上层: keeps the full window above other windows (the mini window always is).
  setPinned?: (pinned: boolean) => void;
  onWindowMode?: (callback: (mode: WindowMode) => void) => () => void;
};

declare global {
  interface Window {
    clipboxDesktop?: ClipboxDesktop;
  }
}
