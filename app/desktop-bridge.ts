import type { CloseBehavior, MiniHidePolicy, ThemeChoice } from "./preferences";

export type UpdateInfo = { status: "disabled" | "current" | "error" } | { status: "available"; version: string; notes: string[] };

export type WindowMode = "full" | "mini";

export type ClipboxDesktop = {
  platform?: string;
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
  aiStatus?: () => Promise<{ hasKey: boolean; origin: string }>;
  aiSave?: (settings: { baseUrl: string; key: string }) => Promise<{ hasKey: boolean; origin: string }>;
  aiClear?: () => Promise<{ hasKey: boolean; origin: string }>;
  aiRequest?: (payload: { url: string; body?: unknown; method?: "GET" | "POST" }) => Promise<{ ok: boolean; status: number; text: string }>;
  fetchSharedLibrary?: (url: string) => Promise<string>;
  // The site's own small icon as a data: URL, or "" when it has none.
  fetchSiteIcon?: (host: string) => Promise<string>;
  relaunch: () => void;
  onFocusSearch: (callback: () => void) => () => void;
  onFlushRequest?: (callback: () => void) => () => void;
  flushDone?: () => void;
  onAutomationCommand: (callback: (request: { requestId: string; command: unknown }) => void) => () => void;
  respondAutomationCommand: (requestId: string, response: unknown) => void;
  automationReady: () => void;
  setWindowMode?: (mode: WindowMode) => void;
  onWindowMode?: (callback: (mode: WindowMode) => void) => () => void;
};

declare global {
  interface Window {
    clipboxDesktop?: ClipboxDesktop;
  }
}
