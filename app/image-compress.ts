// Every picture added to 图片 is shrunk with TinyPNG first (D-037), at most 100 a month on this computer.
// The desktop shell does the network call; here we keep the monthly count and decide what to tell the user.
import type { ClipboxDesktop } from "./desktop-bridge";

// Shared keys built in on purpose (the owner's decision); a different key can be set in 设置.
// The built-in keys take turns so one of them is not used up first.
export const TINIFY_DEFAULT_KEYS = ["NMqwhKbFJBCGnHHPj1FXLNHfbLsN8mjt", "Ycp4Hxb1XgStc5VZjlZrVB1Rt2p0Nhrz"];
export const TINIFY_DEFAULT_KEY = TINIFY_DEFAULT_KEYS[0];
export const TINIFY_ROTATION_STORAGE = "clipbox.tinify.rotation.v1";
export const TINIFY_KEY_STORAGE = "clipbox.tinify.key.v1";
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

function readCustomKey(storage: KeyValueStorage | undefined): string {
  try { return (storage?.getItem(TINIFY_KEY_STORAGE) || "").trim(); } catch { return ""; }
}

export function readTinifyKey(storage: KeyValueStorage | undefined): string {
  return readCustomKey(storage) || TINIFY_DEFAULT_KEY;
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
export function builtInKeyOrder(storage: KeyValueStorage | undefined, now: Date): number[] {
  const { next, bad } = readRotation(storage, now);
  const order = TINIFY_DEFAULT_KEYS.map((_, i) => (next + i) % TINIFY_DEFAULT_KEYS.length);
  const usable = order.filter((i) => !bad.includes(i));
  return usable.length ? usable : order;
}

function advanceRotation(storage: KeyValueStorage | undefined, now: Date, used: number) {
  const rotation = readRotation(storage, now);
  writeRotation(storage, { ...rotation, next: (used + 1) % TINIFY_DEFAULT_KEYS.length });
}

function markKeyBad(storage: KeyValueStorage | undefined, now: Date, index: number) {
  const rotation = readRotation(storage, now);
  if (!rotation.bad.includes(index)) writeRotation(storage, { ...rotation, bad: [...rotation.bad, index] });
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export const COMPRESS_LIMIT_MESSAGE = `本月图片压缩次数已用完（${COMPRESS_MONTHLY_LIMIT}/${COMPRESS_MONTHLY_LIMIT}），下个月 1 号恢复`;

const FAILURE_TEXT: Record<string, string> = {
  network: "没有连上压缩服务",
  key: "压缩服务的密钥不能用",
  limit: "压缩服务本月额度用完",
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
  if (readCompressUsage(storage, now) >= COMPRESS_MONTHLY_LIMIT) throw new Error(COMPRESS_LIMIT_MESSAGE);
  type Outcome = Awaited<ReturnType<NonNullable<ClipboxDesktop["compressImage"]>>>;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const send = async (key: string): Promise<Outcome> => {
    try { return await bridge.compressImage!(bytes, key); } catch { return { ok: false, reason: "service" }; }
  };
  let result: Outcome;
  const custom = readCustomKey(storage);
  if (custom) {
    result = await send(custom);
  } else {
    // Built-in keys take turns. A key that is refused (key or limit) is retried once on the other key and skipped for the month.
    result = { ok: false, reason: "service" };
    for (const index of builtInKeyOrder(storage, now)) {
      result = await send(TINIFY_DEFAULT_KEYS[index]);
      if (result.ok) { advanceRotation(storage, now, index); break; }
      if (result.reason !== "key" && result.reason !== "limit") break;
      markKeyBad(storage, now, index);
    }
  }
  if (!result.ok) return { ...same, failed: true, notice: `${FAILURE_TEXT[result.reason] || "压缩服务暂时不可用"}，已保存原图` };
  addCompressUsage(storage, now);
  // A rare result that is not smaller is not worth keeping.
  if (result.bytes.length >= file.size) return { ...same, notice: "已经很小，保持原样" };
  const blob = new Blob([result.bytes as BlobPart], { type: file.type });
  return { blob, saved: file.size - blob.size, failed: false, notice: `已压缩 ${formatBytes(file.size)} → ${formatBytes(blob.size)}` };
}
