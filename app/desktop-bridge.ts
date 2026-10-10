import type { CloseBehavior, MiniHidePolicy, ThemeChoice } from "./preferences";

export type UpdateInfo = { status: "disabled" | "current" | "error" } | { status: "available"; version: string; notes: string[] };

export type WindowMode = "full" | "mini";

export type ClipboxDesktop = {
  platform?: string;
  copyText: (text: string) => Promise<void>;
  copyImage?: (png: Uint8Array) => Promise<void>;
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
