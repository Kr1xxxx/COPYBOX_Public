// Choices saved in the settings panel.
export type ThemeChoice = "system" | "light" | "dark";
export type CloseBehavior = "tray" | "taskbar" | "quit";
export const TRASH_DAY_OPTIONS = [0, 7, 30, 90] as const;
// 复制后贴到刚才的窗口: seconds before the same text may be pasted into the same window again (owner, 2026-10-19: 6).
export const PASTE_BACK_REPEAT_OPTIONS = [3, 6, 10, 30] as const;
export type PasteBackRepeat = (typeof PASTE_BACK_REPEAT_OPTIONS)[number];
// Until someone picks another option, deleted items are cleared after 7 days (owner's choice, 2026-10-09).
export const DEFAULT_TRASH_DAYS = 7;
