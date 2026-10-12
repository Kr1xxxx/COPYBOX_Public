// Small choices kept in the browser's storage (theme, close behaviour, ...): read one back only if it is an allowed value.
export function readStoredChoice<T extends string | number>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    const match = allowed.find((value) => String(value) === raw);
    if (match !== undefined) return match;
  } catch {
    // Storage can be unavailable; use the default.
  }
  return fallback;
}

export function writeStoredChoice(key: string, value: string | number) {
  try { localStorage.setItem(key, String(value)); } catch { /* keep the in-memory choice for this session */ }
}

// parseRefreshContext only knows the text sections; the 图片 flag rides along in the same stored object.
export function readRefreshedImageView(stored: string | null) {
  try { return JSON.parse(stored || "null")?.imageView === true; } catch { return false; }
}
