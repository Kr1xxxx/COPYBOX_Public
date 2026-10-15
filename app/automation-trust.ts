// Programs the person told to 「始终允许」 when the command line asked for a 秘密 (D-059). The desktop shell says who
// asked ({ name, id }: id is where the program's file is, see src-tauri/src/caller.rs); a remembered id reads or checks
// a 秘密 without the question. An export of all 秘密 is always asked. The list stays on this device: it is never put
// in a backup (data-transfer.ts LOCAL_ONLY_KEYS), because the same path on another computer may be another program.

export const AUTOMATION_TRUST_KEY = "clipbox.automation-trusted.v1";
// Fired on window when the list changes, so an open 设置 page shows it at once.
export const AUTOMATION_TRUST_EVENT = "clipbox:automation-trust";
const MAX_TRUSTED = 50;
const MAX_TEXT = 1024;

export type AutomationCaller = { name: string; id: string };
export type TrustedCaller = AutomationCaller & { addedAt: number };

const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null);

/** The caller the shell sent with a command, or null when it could not tell (then only 允许 / 拒绝 are offered). */
export function parseAutomationCaller(value: unknown): AutomationCaller | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = text(record.name, 120);
  const id = text(record.id, MAX_TEXT);
  return name && id ? { name, id } : null;
}

/** Reads the stored list; anything malformed is dropped rather than trusted. */
export function parseTrustedCallers(raw: string | null): TrustedCaller[] {
  if (!raw) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const list: TrustedCaller[] = [];
  for (const entry of value) {
    const caller = parseAutomationCaller(entry);
    const addedAt = (entry as { addedAt?: unknown })?.addedAt;
    if (!caller || seen.has(caller.id) || typeof addedAt !== "number" || !Number.isFinite(addedAt)) continue;
    seen.add(caller.id);
    list.push({ ...caller, addedAt });
  }
  return list.slice(0, MAX_TRUSTED);
}

export function isTrustedCaller(list: readonly TrustedCaller[], caller: AutomationCaller | null) {
  return !!caller && list.some((entry) => entry.id === caller.id);
}

export function withTrustedCaller(list: readonly TrustedCaller[], caller: AutomationCaller, now: number): TrustedCaller[] {
  if (isTrustedCaller(list, caller)) return [...list];
  return [...list, { ...caller, addedAt: now }].slice(-MAX_TRUSTED);
}

export function withoutTrustedCaller(list: readonly TrustedCaller[], id: string): TrustedCaller[] {
  return list.filter((entry) => entry.id !== id);
}

/** Only reading or checking one 秘密 may skip the question; exporting all of them is always asked. */
export function trustCovers(action: string) {
  return action === "secret-get" || action === "secret-verify";
}

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export function readTrustedCallers(): TrustedCaller[] {
  try { return parseTrustedCallers(storage()?.getItem(AUTOMATION_TRUST_KEY) ?? null); } catch { return []; }
}

export function writeTrustedCallers(list: readonly TrustedCaller[]) {
  const store = storage();
  if (!store) return;
  if (list.length) store.setItem(AUTOMATION_TRUST_KEY, JSON.stringify(list));
  else store.removeItem(AUTOMATION_TRUST_KEY);
  window.dispatchEvent(new Event(AUTOMATION_TRUST_EVENT));
}
