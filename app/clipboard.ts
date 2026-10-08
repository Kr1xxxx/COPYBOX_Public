// This timer belongs to the application module, not to the editor that unmounts
// after saving. Desktop expiry runs in the main process even while hidden.
let clearTimer: ReturnType<typeof setTimeout> | undefined;

export const CLIPBOARD_CLEAR_OPTIONS = [0, 30, 60, 300] as const;
export const DEFAULT_CLIPBOARD_CLEAR_SECONDS = 60;
const CLEAR_KEY = "clipbox.clipboard-clear-seconds";

export function readClipboardClearSeconds(): number {
  try {
    const value = Number(localStorage.getItem(CLEAR_KEY));
    if (localStorage.getItem(CLEAR_KEY) !== null && (CLIPBOARD_CLEAR_OPTIONS as readonly number[]).includes(value)) return value;
  } catch {
    // Storage can be unavailable; fall back to the safe default.
  }
  return DEFAULT_CLIPBOARD_CLEAR_SECONDS;
}

export function writeClipboardClearSeconds(seconds: number) {
  try { localStorage.setItem(CLEAR_KEY, String(seconds)); } catch { /* keep the in-memory choice only */ }
}

export async function copyTextWithExpiry(text: string) {
  const seconds = readClipboardClearSeconds();
  if (window.clipboxDesktop) {
    await window.clipboxDesktop.copyText(text, seconds);
    return;
  }
  await navigator.clipboard.writeText(text);
  clearTimeout(clearTimer);
  if (seconds === 0) return;
  clearTimer = setTimeout(async () => {
    try {
      if (await navigator.clipboard.readText() === text) await navigator.clipboard.writeText("");
    } catch {
      // Browser clipboard permission can be withdrawn after the copy.
    }
  }, seconds * 1000);
}
