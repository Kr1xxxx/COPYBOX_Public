// Pure helpers for API 密钥 in the 保险箱 (Mac only).

export const APIKEY_REMIND_DAYS = 7;

// Pasted keys often carry a trailing newline or spaces; a key itself never has any.
export function cleanApiKey(raw: string): string {
  return raw.trim();
}

export function hasInnerSpace(value: string): boolean {
  return /\s/.test(value.trim());
}

export function lastFour(value: string): string {
  return value.length <= 4 ? value : value.slice(-4);
}

function parseDay(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const value = new Date(year, month - 1, date);
  return value.getFullYear() === year && value.getMonth() === month - 1 && value.getDate() === date ? value.getTime() : null;
}

export function isValidDay(day: string): boolean {
  return parseDay(day) !== null;
}

// Whole days from today until the expiry day (negative once it has passed); null when there is no valid date.
export function daysUntil(day: string, now: number): number | null {
  const at = parseDay(day);
  if (at === null) return null;
  const today = new Date(now);
  return Math.round((at - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
}

export type ExpiryState = { kind: "none" | "ok" | "soon" | "expired"; text: string };

export function expiryState(day: string, now: number): ExpiryState {
  const days = daysUntil(day, now);
  if (days === null) return { kind: "none", text: "" };
  if (days < 0) return { kind: "expired", text: `已过期 ${-days} 天` };
  if (days === 0) return { kind: "soon", text: "今天到期" };
  if (days <= APIKEY_REMIND_DAYS) return { kind: "soon", text: `${days} 天后到期` };
  return { kind: "ok", text: `${day} 到期` };
}
