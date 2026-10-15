// Every picture added to 图片 is shrunk with TinyPNG first (D-037), at most 100 a month on this computer.
// The desktop shell does the network call; here we keep the monthly count and decide what to tell the user.
import type { ClipboxDesktop } from "./desktop-bridge";
import { SHARED_URL_KEY } from "./shared-library-client.ts";
import { syncCodeOf } from "./shared-library.ts";

// No key is in the repo (owner, 2026-10-14). Up to two own keys set in 设置 come first. Next, with a 企业同步码 set
// (设置 → 账号与同步), the picture goes through copyboxx.com/compress, which holds the company's key (D-055); the shell is
// asked for "proxy:<code>". Last, keys an installer may carry from a CI secret, named "builtin:N". With none of these,
// pictures are stored as they are.
export const TINIFY_ROTATION_STORAGE = "clipbox.tinify.rotation.v1";
export const TINIFY_KEY_STORAGE = "clipbox.tinify.key.v1";
export const TINIFY_KEY2_STORAGE = "clipbox.tinify.key2.v1";
export const TINIFY_CUSTOM_STATE_STORAGE = "clipbox.tinify.custom.v1";
export const TINIFY_USAGE_STORAGE = "clipbox.tinify.usage.v1";
export const COMPRESS_MONTHLY_LIMIT = 100;
export const COMPRESSIBLE_TYPES = ["image/png", "image/jpeg", "image/webp"];

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function monthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// How many pictures were compressed in the month of `now`; a new month starts again at 0.
export function readCompressUsage(storage: KeyValueStorage | undefined, now: Date): number {
  try {
    const stored = JSON.parse(storage?.getItem(TINIFY_USAGE_STORAGE) || "null");
    if (stored && stored.month === monthKey(now) && Number.isInteger(stored.count) && stored.count > 0) return stored.count;
  } catch { /* unreadable: count from 0 */ }
  return 0;
}

export function addCompressUsage(storage: KeyValueStorage | undefined, now: Date): number {
  const count = readCompressUsage(storage, now) + 1;
  try { storage?.setItem(TINIFY_USAGE_STORAGE, JSON.stringify({ month: monthKey(now), count })); } catch { /* optional */ }
  return count;
}

function readStored(storage: KeyValueStorage | undefined, name: string): string {
  try { return (storage?.getItem(name) || "").trim(); } catch { return ""; }
}

// The two keys set in 设置, first and second; an empty one is "".
export function readCustomKeys(storage: KeyValueStorage | undefined): [string, string] {
  return [readStored(storage, TINIFY_KEY_STORAGE), readStored(storage, TINIFY_KEY2_STORAGE)];
}


// Own keys: the first is used until it is refused (wrong key or quota used up), then the second, until the month changes.
type CustomState = { month: string; bad: number[] };

function readCustomState(storage: KeyValueStorage | undefined, now: Date): CustomState {
  try {
    const stored = JSON.parse(storage?.getItem(TINIFY_CUSTOM_STATE_STORAGE) || "null");
    if (stored && stored.month === monthKey(now) && Array.isArray(stored.bad)) {
      return { month: stored.month, bad: stored.bad.filter((i: unknown) => i === 0 || i === 1) };
    }
  } catch { /* unreadable: start fresh */ }
  return { month: monthKey(now), bad: [] };
}

function writeCustomState(storage: KeyValueStorage | undefined, state: CustomState) {
  try { storage?.setItem(TINIFY_CUSTOM_STATE_STORAGE, JSON.stringify(state)); } catch { /* optional */ }
}

export function customKeyOrder(storage: KeyValueStorage | undefined, now: Date): number[] {
  const keys = readCustomKeys(storage);
  const set = [0, 1].filter((i) => keys[i]);
  const { bad } = readCustomState(storage, now);
  const usable = set.filter((i) => !bad.includes(i));
  return usable.length ? usable : set;
}

// For 设置: which own key the next picture uses (0 = first, 1 = second, null = none set), and which were refused this month.
export function customKeyStatus(storage: KeyValueStorage | undefined, now: Date): { active: number | null; refused: number[] } {
  const keys = readCustomKeys(storage);
  const order = customKeyOrder(storage, now);
  const refused = readCustomState(storage, now).bad.filter((i) => keys[i]);
  return { active: order.length ? order[0] : null, refused };
}

// Saves both own keys; a changed key gets a fresh start this month.
export function saveCustomKeys(storage: KeyValueStorage | undefined, keys: [string, string], now: Date) {
  const before = readCustomKeys(storage);
  const clean = keys.map((key) => key.trim());
  try {
    [TINIFY_KEY_STORAGE, TINIFY_KEY2_STORAGE].forEach((name, i) => { if (clean[i]) storage?.setItem(name, clean[i]); else storage?.removeItem(name); });
  } catch { /* optional */ }
  const state = readCustomState(storage, now);
  writeCustomState(storage, { ...state, bad: state.bad.filter((i) => clean[i] === before[i]) });
}

type Rotation = { month: string; next: number; bad: number[] };

function readRotation(storage: KeyValueStorage | undefined, now: Date): Rotation {
  try {
    const stored = JSON.parse(storage?.getItem(TINIFY_ROTATION_STORAGE) || "null");
    if (stored && stored.month === monthKey(now) && Number.isInteger(stored.next) && Array.isArray(stored.bad)) {
      return { month: stored.month, next: stored.next, bad: stored.bad.filter((i: unknown) => Number.isInteger(i)) };
    }
  } catch { /* unreadable: start fresh */ }
  return { month: monthKey(now), next: 0, bad: [] };
}

function writeRotation(storage: KeyValueStorage | undefined, rotation: Rotation) {
  try { storage?.setItem(TINIFY_ROTATION_STORAGE, JSON.stringify(rotation)); } catch { /* optional */ }
}

// The built-in keys to try for the next picture, in order: the one whose turn it is first, then the others.
// A key that was refused this month (wrong key or quota used up) is left out until the month changes.
export function builtInKeyOrder(storage: KeyValueStorage | undefined, now: Date, count: number): number[] {
  const { next, bad } = readRotation(storage, now);
  const order = Array.from({ length: count }, (_, i) => (next + i) % count);
  const usable = order.filter((i) => !bad.includes(i));
  return usable.length ? usable : order;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export const COMPRESS_NO_KEY_NOTICE = "未压缩：在 设置 → 账号与同步 填好企业同步码后就能压缩";

// The company 同步码 that compression can go through, or "" (no code, or a full address instead of a code).
export function companyCompressCode(storage: KeyValueStorage | undefined): string {
  return syncCodeOf(readStored(storage, SHARED_URL_KEY));
}

export const COMPRESS_LIMIT_MESSAGE = `本月图片压缩次数已用完（${COMPRESS_MONTHLY_LIMIT}/${COMPRESS_MONTHLY_LIMIT}），下个月 1 号恢复`;

const FAILURE_TEXT: Record<string, string> = {
  network: "没有连上压缩服务",
  key: "压缩服务的密钥不能用",
  limit: "压缩服务本月额度用完",
  code: "企业同步码不能用来压缩",
};

export type CompressResult = { blob: Blob; saved: number; failed: boolean; notice: string };

type Deps = { bridge?: ClipboxDesktop; storage?: KeyValueStorage; now?: Date };

// Returns the picture to store. Throws only when the monthly cap is reached; any other trouble keeps the original.
export async function compressForUpload(file: Blob, deps: Deps = {}): Promise<CompressResult> {
  const bridge = deps.bridge ?? (typeof window === "undefined" ? undefined : window.clipboxDesktop);
  const storage = deps.storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const now = deps.now ?? new Date();
  const same: CompressResult = { blob: file, saved: 0, failed: false, notice: "" };
  if (!bridge?.compressImage || !COMPRESSIBLE_TYPES.includes(file.type)) return same;
  const keys = readCustomKeys(storage);
  const own = customKeyOrder(storage, now);
  const company = own.length ? "" : companyCompressCode(storage);
  let builtIn = 0;
  if (!own.length && !company) { try { builtIn = Math.max(0, Math.floor(Number(await bridge.compressBuiltInCount?.()) || 0)); } catch { builtIn = 0; } }
  // No key at all: nothing is sent and nothing is counted.
  if (!own.length && !company && !builtIn) return { ...same, failed: true, notice: COMPRESS_NO_KEY_NOTICE };
  if (readCompressUsage(storage, now) >= COMPRESS_MONTHLY_LIMIT) throw new Error(COMPRESS_LIMIT_MESSAGE);
  type Outcome = Awaited<ReturnType<NonNullable<ClipboxDesktop["compressImage"]>>>;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const send = async (key: string): Promise<Outcome> => {
    try { return await bridge.compressImage!(bytes, key); } catch { return { ok: false, reason: "service" }; }
  };
  let result: Outcome = { ok: false, reason: "service" };
  if (own.length) {
    // Own keys: the first one, and on a refusal (key or limit) the second one, which then stays in use for the month.
    for (const index of own) {
      result = await send(keys[index]);
      if (result.ok) break;
      if (result.reason !== "key" && result.reason !== "limit") break;
      const state = readCustomState(storage, now);
      if (!state.bad.includes(index)) writeCustomState(storage, { ...state, bad: [...state.bad, index] });
    }
  } else if (company) {
    result = await send(`proxy:${company}`);
  } else {
    // Built-in keys take turns. A key that is refused (key or limit) is retried on the next one and skipped for the month.
    for (const index of builtInKeyOrder(storage, now, builtIn)) {
      result = await send(`builtin:${index}`);
      if (result.ok) { writeRotation(storage, { ...readRotation(storage, now), next: (index + 1) % builtIn }); break; }
      if (result.reason !== "key" && result.reason !== "limit") break;
      const rotation = readRotation(storage, now);
      if (!rotation.bad.includes(index)) writeRotation(storage, { ...rotation, bad: [...rotation.bad, index] });
    }
  }
  if (!result.ok) return { ...same, failed: true, notice: `${FAILURE_TEXT[result.reason] || "压缩服务暂时不可用"}，已保存原图` };
  addCompressUsage(storage, now);
  // A rare result that is not smaller is not worth keeping.
  if (result.bytes.length >= file.size) return { ...same, notice: "已经很小，保持原样" };
  const blob = new Blob([result.bytes as BlobPart], { type: file.type });
  const how = company ? "已通过企业同步码压缩" : "已压缩";
  return { blob, saved: file.size - blob.size, failed: false, notice: `${how} ${formatBytes(file.size)} → ${formatBytes(blob.size)}` };
}
