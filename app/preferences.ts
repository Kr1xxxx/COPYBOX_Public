// Choices saved in the settings panel.
export type ThemeChoice = "system" | "light" | "dark";
export type CloseBehavior = "tray" | "taskbar" | "quit";
export const TRASH_DAY_OPTIONS = [0, 7, 30, 90] as const;
// Until someone picks another option, deleted items are cleared after 7 days (owner's choice, 2026-10-09).
export const DEFAULT_TRASH_DAYS = 7;
