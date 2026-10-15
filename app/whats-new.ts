// "What's new" notices (D-069): one short popup after an update reaches staff. Two sources:
// - a new app version: the lines for that version in app/release-notes.ts, shown once after the update installs;
// - company 话术 / Tips pushed by 企业同步码 (no app update): a `notice` inside the synced library file.
// Only notable additions (a new feature, "新增 N 条话术"); never button or design tweaks, never old changes.
// The owner approves every text before it ships (docs/whats-new.md).

export type WhatsNewNotice = { kind: "app" | "content"; id: string; title: string; items: string[] };
export type ReleaseNote = { version: string; items: string[] };

export const WHATS_NEW_KEY = "clipbox.whats-new.v1";
export const WHATS_NEW_MAX_ITEMS = 6;
export const WHATS_NEW_MAX_TEXT = 80;
const TITLE_MAX = 24;
const ID_MAX = 80;
export const CONTENT_NOTICE_TITLE = "公司话术有更新";

type SeenState = { version?: string; content?: string };

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const line = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

// "1.99.0", "v1.99" → [1, 99, 0]; anything without a leading number (e.g. 网页测试版) → null.
function parts(version: string): number[] | null {
  const match = /^v?(\d+(?:\.\d+)*)/i.exec(version.trim());
  return match ? match[1].split(".").map(Number) : null;
}

export function compareVersions(a: string, b: string): number {
  const left = parts(a) ?? [];
  const right = parts(b) ?? [];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

export function cleanNoticeItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(line).filter(Boolean).slice(0, WHATS_NEW_MAX_ITEMS).map((text) => clip(text, WHATS_NEW_MAX_TEXT));
}

// The lines for every version after `seen` up to and including `current`, newest first. `seen` undefined = only `current`.
export function appNotice(notes: readonly ReleaseNote[], seen: string | undefined, current: string): WhatsNewNotice | null {
  if (!parts(current)) return null;
  const due = notes
    .filter((note) => parts(note.version) && compareVersions(note.version, current) <= 0
      && (seen === undefined ? compareVersions(note.version, current) === 0 : compareVersions(note.version, seen) > 0))
    .sort((a, b) => compareVersions(b.version, a.version));
  const items = cleanNoticeItems(due.flatMap((note) => note.items));
  return items.length ? { kind: "app", id: current, title: "Copyboxx 已更新", items } : null;
}

// The `notice` of a company library file: {"id": "...", "title"?: "...", "items": ["新增 12 条话术", ...]}.
export function parseContentNotice(raw: unknown): WhatsNewNotice | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const id = line(value.id);
  const items = cleanNoticeItems(value.items);
  if (!id || id.length > ID_MAX || !items.length) return null;
  return { kind: "content", id, title: clip(line(value.title) || CONTENT_NOTICE_TITLE, TITLE_MAX), items };
}

function readSeen(): SeenState {
  try {
    const value = JSON.parse(localStorage.getItem(WHATS_NEW_KEY) || "null") as SeenState | null;
    return value && typeof value === "object" ? value : {};
  } catch { return {}; }
}

function writeSeen(change: SeenState) {
  try { localStorage.setItem(WHATS_NEW_KEY, JSON.stringify({ ...readSeen(), ...change })); } catch { /* shown again next time at worst */ }
}

// Called once the app knows its version. A new install (`firstRun`) shows nothing and only remembers the version;
// an app that never stored a version before (updated from a build without notices) shows this version's lines.
// Returns the notice to show; the version counts as seen once markNoticeSeen runs (知道了), or right away when there is none.
export function takeAppNotice(notes: readonly ReleaseNote[], current: string, firstRun: boolean): WhatsNewNotice | null {
  if (!parts(current)) return null;
  const { version: seen } = readSeen();
  if (seen !== undefined && compareVersions(current, seen) <= 0) {
    if (seen !== current) writeSeen({ version: current });
    return null;
  }
  const notice = firstRun && seen === undefined ? null : appNotice(notes, seen, current);
  if (!notice) writeSeen({ version: current });
  return notice;
}

// After a 同步码 sync. `hadEntries` is false on the very first sync of a library on this device (everything was just
// added): its notice is about older changes, so it is remembered without showing.
export function takeContentNotice(notice: WhatsNewNotice | null, hadEntries: boolean): WhatsNewNotice | null {
  if (!notice || readSeen().content === notice.id) return null;
  if (!hadEntries) {
    writeSeen({ content: notice.id });
    return null;
  }
  return notice;
}

export function markNoticeSeen(notice: WhatsNewNotice) {
  writeSeen(notice.kind === "app" ? { version: notice.id } : { content: notice.id });
}
