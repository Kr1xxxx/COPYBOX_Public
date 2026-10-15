// Every picture added to 图片 is shrunk with TinyPNG first (D-037), at most 100 a month on this computer.
// The desktop shell does the network call; here we keep the monthly count and decide what to tell the user.
import type { ClipboxDesktop } from "./desktop-bridge";
import { secretAwareStorage } from "./secret-settings.ts";

// Each person fills in up to two TinyPNG keys of their own in 设置 → 数据 → 图片压缩 (D-055). No key is built into the app
// or kept on the website; without a key, pictures are stored as they are.
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

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export const COMPRESS_NO_KEY_NOTICE = "未压缩：请先在 设置 → 数据 → 图片压缩 填写你自己的压缩密钥";

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
  // The own keys come from memory (Windows Credential Manager, read once on start; D-057), the counters from storage.
  const storage = deps.storage ?? secretAwareStorage();
  const now = deps.now ?? new Date();
  const same: CompressResult = { blob: file, saved: 0, failed: false, notice: "" };
  if (!bridge?.compressImage || !COMPRESSIBLE_TYPES.includes(file.type)) return same;
  const keys = readCustomKeys(storage);
  const own = customKeyOrder(storage, now);
  // No key at all: nothing is sent and nothing is counted.
  if (!own.length) return { ...same, failed: true, notice: COMPRESS_NO_KEY_NOTICE };
  if (readCompressUsage(storage, now) >= COMPRESS_MONTHLY_LIMIT) throw new Error(COMPRESS_LIMIT_MESSAGE);
  type Outcome = Awaited<ReturnType<NonNullable<ClipboxDesktop["compressImage"]>>>;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const send = async (key: string): Promise<Outcome> => {
    try { return await bridge.compressImage!(bytes, key); } catch { return { ok: false, reason: "service" }; }
  };
  let result: Outcome = { ok: false, reason: "service" };
  // The first key, and on a refusal (key or limit) the second one, which then stays in use for the month.
  for (const index of own) {
    result = await send(keys[index]);
    if (result.ok) break;
    if (result.reason !== "key" && result.reason !== "limit") break;
    const state = readCustomState(storage, now);
    if (!state.bad.includes(index)) writeCustomState(storage, { ...state, bad: [...state.bad, index] });
  }
  if (!result.ok) return { ...same, failed: true, notice: `${FAILURE_TEXT[result.reason] || "压缩服务暂时不可用"}，已保存原图` };
  addCompressUsage(storage, now);
  // A rare result that is not smaller is not worth keeping.
  if (result.bytes.length >= file.size) return { ...same, notice: "已经很小，保持原样" };
  const blob = new Blob([result.bytes as BlobPart], { type: file.type });
  return { blob, saved: file.size - blob.size, failed: false, notice: `已压缩 ${formatBytes(file.size)} → ${formatBytes(blob.size)}` };
}
