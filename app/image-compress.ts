// Every picture added to 图片 is shrunk with TinyPNG first (D-037), at most 100 a month on this computer.
// The desktop shell does the network call; here we keep the monthly count and decide what to tell the user.
import type { ClipboxDesktop } from "./desktop-bridge";

// A shared key built in on purpose (the owner's decision); a different key can be set in 设置.
export const TINIFY_DEFAULT_KEY = "NMqwhKbFJBCGnHHPj1FXLNHfbLsN8mjt";
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

export function readTinifyKey(storage: KeyValueStorage | undefined): string {
  try { return (storage?.getItem(TINIFY_KEY_STORAGE) || "").trim() || TINIFY_DEFAULT_KEY; } catch { return TINIFY_DEFAULT_KEY; }
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
  let result: Awaited<ReturnType<NonNullable<ClipboxDesktop["compressImage"]>>>;
  try {
    result = await bridge.compressImage(new Uint8Array(await file.arrayBuffer()), readTinifyKey(storage));
  } catch {
    result = { ok: false, reason: "service" };
  }
  if (!result.ok) return { ...same, failed: true, notice: `${FAILURE_TEXT[result.reason] || "压缩服务暂时不可用"}，已保存原图` };
  addCompressUsage(storage, now);
  // A rare result that is not smaller is not worth keeping.
  if (result.bytes.length >= file.size) return { ...same, notice: "已经很小，保持原样" };
  const blob = new Blob([result.bytes as BlobPart], { type: file.type });
  return { blob, saved: file.size - blob.size, failed: false, notice: `已压缩 ${formatBytes(file.size)} → ${formatBytes(blob.size)}` };
}
