// Automatic daily backup of everything (话术, 账号, 图片, settings). The file holds the same records the app keeps, as they are
// (already encrypted stays encrypted), without a password, so it has the same protection as the data folder it sits in.
// The desktop app keeps the newest seven in its data folder; the browser trial keeps them in its own storage. Restoring
// always goes through applyPayload, which checks first and keeps a way back.
//
// Since D-043 the desktop keeps each picture once, as its own file in `backups/images/` named after a SHA-256 of its bytes,
// and the day file only points at it; a day only writes the pictures that are not there yet, and pictures no kept day
// points at are removed. Thumbnails are left out (the app makes them again), and so are the keys kept on this device only.
import {
  collectLocal, countImages, countPayload, encodeValue, IMAGE_DB, isBookkeepingId, listDatabases, parseBackupText, TransferError,
  type TransferPayload, type Wire,
} from "./data-transfer.ts";

export const AUTO_BACKUP_KEEP = 7;
export const AUTO_BACKUP_ENABLED_KEY = "clipbox.auto-backup.enabled";
// When the last automatic backup failed and why ({ at, reason }); removed after the next one succeeds. Never in a backup.
export const AUTO_BACKUP_ERROR_KEY = "clipbox.auto-backup.last-error";
const WEB_STORE_KEY = "clipbox.web-backups.v1";
export const AUTO_BACKUP_FORMAT = "clipbox-auto-backup";
// Version 1: pictures inside the day file (the browser trial, and every file made before D-043).
// Version 2: pictures as shared files the day file points at ({ "$ref": "<sha-256>.bin", "size": n }).
const INLINE_VERSION = 1;
const SHARED_VERSION = 2;
// Records read between two pauses, so a large picture collection never holds the page still for long.
const BATCH = 4;
// Tells the 设置 rows that a backup run finished (saved or failed), so they can show the newest state.
export const AUTO_BACKUP_EVENT = "clipbox-auto-backup";

export type BackupFile = { name: string; size: number };
// The shared picture files (desktop only).
export type ImageFiles = {
  list: () => Promise<BackupFile[]>;
  save: (name: string, bytes: Uint8Array) => Promise<void>;
  read: (name: string) => Promise<Uint8Array>;
  // Removes every picture file whose name is not in `keep`.
  prune: (keep: string[]) => Promise<void>;
};
export type BackupStore = {
  list: () => Promise<BackupFile[]>;
  save: (name: string, text: string) => Promise<void>;
  read: (name: string) => Promise<string>;
  images?: ImageFiles;
};
type Prefs = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type ImageRef = { $ref: string; size: number };
export type BackupError = { at: number; reason: "space" | "other" };

const NAME = /^clipbox-auto-(\d{4})-(\d{2})-(\d{2})\.json$/;
export const isAutoBackupName = (name: string) => NAME.test(name);
const IMAGE_NAME = /^[0-9a-f]{64}\.bin$/;
export const isImageFileName = (name: string) => IMAGE_NAME.test(name);

const two = (value: number) => String(value).padStart(2, "0");
// The date on this computer's clock, so "today" matches what the person sees.
export function autoBackupName(now: Date = new Date()) {
  return `clipbox-auto-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.json`;
}

export function backupDue(names: string[], now: Date = new Date()) {
  return !names.includes(autoBackupName(now));
}

// The names to delete so only the newest `keep` remain. Names that are not ours are never listed.
export function backupsToDelete(names: string[], keep = AUTO_BACKUP_KEEP) {
  return names.filter(isAutoBackupName).sort().reverse().slice(keep);
}

export function backupDateLabel(name: string) {
  const match = NAME.exec(name);
  return match ? `${Number(match[2])}月${Number(match[3])}日` : name;
}

export function backupSizeLabel(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function readAutoBackupEnabled(storage: Pick<Storage, "getItem"> = localStorage) {
  try { return storage.getItem(AUTO_BACKUP_ENABLED_KEY) !== "off"; } catch { return true; }
}

export function writeAutoBackupEnabled(enabled: boolean, storage: Pick<Storage, "setItem"> = localStorage) {
  try { storage.setItem(AUTO_BACKUP_ENABLED_KEY, enabled ? "on" : "off"); } catch { /* the choice lasts for this session only */ }
}

function browserPrefs(): Prefs | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

// "space" when the disk, the browser's storage or the size limits ran out; everything else is "other".
export function backupFailureReason(error: unknown): BackupError["reason"] {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /quota|too-large|no space|not enough space|disk full|os error (28|39|112)\b|invalid string length|allocation failed/i.test(text) ? "space" : "other";
}

export function readBackupError(prefs: Pick<Storage, "getItem"> | null = browserPrefs()): BackupError | null {
  try {
    const value = JSON.parse(prefs?.getItem(AUTO_BACKUP_ERROR_KEY) ?? "null") as Partial<BackupError> | null;
    if (!value || typeof value.at !== "number") return null;
    return { at: value.at, reason: value.reason === "space" ? "space" : "other" };
  } catch {
    return null;
  }
}

export function backupErrorMessage(error: BackupError) {
  const day = new Date(error.at);
  const date = `${day.getMonth() + 1}月${day.getDate()}日`;
  return error.reason === "space"
    ? `最近一次自动备份没有成功（${date}）：空间不够或内容太多，存不下。可以清理一下电脑空间，或用「完整备份」手动存一份。`
    : `最近一次自动备份没有成功（${date}）。会自动再试，也可以用「完整备份」手动存一份。`;
}

export function webStore(storage: Pick<Storage, "getItem" | "setItem"> = localStorage): BackupStore {
  const load = (): Record<string, string> => {
    try { const value = JSON.parse(storage.getItem(WEB_STORE_KEY) || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; }
  };
  return {
    list: async () => Object.entries(load()).filter(([name]) => isAutoBackupName(name)).map(([name, text]) => ({ name, size: text.length })).sort((a, b) => b.name.localeCompare(a.name)),
    save: async (name, text) => {
      const all = load();
      all[name] = text;
      for (const old of backupsToDelete(Object.keys(all))) delete all[old];
      storage.setItem(WEB_STORE_KEY, JSON.stringify(all));
    },
    read: async (name) => {
      const text = load()[name];
      if (typeof text !== "string") throw new Error("missing");
      return text;
    },
  };
}

type BackupBridge = Pick<NonNullable<Window["clipboxDesktop"]>, "backupSave" | "backupList" | "backupRead" | "backupImageSave" | "backupImageList" | "backupImageRead" | "backupImagePrune">;
export function desktopStore(bridge: BackupBridge): BackupStore | null {
  const { backupSave, backupList, backupRead, backupImageSave, backupImageList, backupImageRead, backupImagePrune } = bridge;
  if (!backupSave || !backupList || !backupRead) return null;
  // An older desktop shell without the picture commands keeps writing pictures inside the day file.
  const images: ImageFiles | undefined = backupImageSave && backupImageList && backupImageRead && backupImagePrune ? {
    list: async () => (await backupImageList()).filter((file) => isImageFileName(file.name)),
    save: (name, bytes) => backupImageSave(name, bytes),
    read: (name) => backupImageRead(name),
    prune: (keep) => backupImagePrune(keep),
  } : undefined;
  return {
    list: async () => (await backupList()).filter((file) => isAutoBackupName(file.name)),
    save: (name, text) => backupSave(name, new TextEncoder().encode(text)),
    read: async (name) => new TextDecoder().decode(await backupRead(name)),
    images,
  };
}

export function getBackupStore(): BackupStore {
  return (typeof window !== "undefined" && window.clipboxDesktop && desktopStore(window.clipboxDesktop)) || webStore();
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const isRef = (value: unknown): value is ImageRef => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 2 && typeof (value as ImageRef).$ref === "string" && typeof (value as ImageRef).size === "number";
};

// Like encodeValue, but every run of bytes goes through `bytesToWire` (a shared picture file, or inline base64).
async function encodeWith(value: unknown, bytesToWire: (bytes: Uint8Array) => Promise<Wire>): Promise<Wire> {
  if (value instanceof ArrayBuffer) return bytesToWire(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) return bytesToWire(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  if (Array.isArray(value)) {
    const out: Wire[] = [];
    for (const inner of value) out.push(await encodeWith(inner, bytesToWire));
    return out;
  }
  if (value && typeof value === "object") {
    const out: Record<string, Wire> = {};
    for (const [key, inner] of Object.entries(value)) out[key] = await encodeWith(inner, bytesToWire);
    return out;
  }
  return encodeValue(value);
}

// What goes into an automatic backup: the settings, and the picture database read a few records at a time (pausing in
// between). With `images` every picture's bytes become a shared file, written only when it is not there yet; without
// it they stay inline. The thumbnail database is left out: the app makes thumbnails again when they are missing.
export async function collectBackup(images?: ImageFiles, storage: Storage = localStorage, factory: IDBFactory = indexedDB): Promise<TransferPayload> {
  const payload: TransferPayload = { localStorage: collectLocal(storage), indexedDB: {} };
  if (!(await listDatabases(factory)).has(IMAGE_DB)) return payload;
  const present = images ? new Map((await images.list()).map((file) => [file.name, file.size])) : null;
  const bytesToWire = async (bytes: Uint8Array): Promise<Wire> => {
    if (!images || !present) return encodeValue(bytes);
    const name = `${await sha256Hex(bytes)}.bin`;
    if (present.get(name) !== bytes.byteLength) {
      await images.save(name, bytes);
      present.set(name, bytes.byteLength);
    }
    return { $ref: name, size: bytes.byteLength };
  };
  const db = await request(factory.open(IMAGE_DB));
  try {
    const names = Array.from(db.objectStoreNames);
    if (names.length === 0) return payload;
    // The keys of every table at one moment; the rows are then read a few at a time, skipping any deleted meanwhile.
    const keyTx = db.transaction(names);
    const keys = await Promise.all(names.map((name) => request(keyTx.objectStore(name).getAllKeys())));
    const tables: Record<string, Wire[]> = {};
    for (const [index, name] of names.entries()) {
      const rows: Wire[] = [];
      for (let at = 0; at < keys[index].length; at += BATCH) {
        const tx = db.transaction(name);
        const batch = await Promise.all(keys[index].slice(at, at + BATCH).map((key) => request(tx.objectStore(name).get(key))));
        for (const row of batch) if (row !== undefined) rows.push(await encodeWith(row, bytesToWire));
        await pause();
      }
      tables[name] = rows;
    }
    // A picture deleted while this ran loses its description too, so no restored picture is missing its contents.
    if (tables.meta && tables.blobs) {
      const rowId = (row: Wire) => (row as { id?: unknown } | null)?.id;
      const stored = new Set(tables.blobs.map(rowId));
      tables.meta = tables.meta.filter((row) => isBookkeepingId(rowId(row)) || stored.has(rowId(row)));
    }
    payload.indexedDB[IMAGE_DB] = tables;
  } finally {
    db.close();
  }
  return payload;
}

// Every shared picture file a payload (or any parsed value) points at, with its size.
export function referencedImages(value: unknown, found = new Map<string, number>()): Map<string, number> {
  if (isRef(value)) found.set(value.$ref, value.size);
  else if (Array.isArray(value)) for (const inner of value) referencedImages(inner, found);
  else if (value && typeof value === "object") for (const inner of Object.values(value)) referencedImages(inner, found);
  return found;
}

export function backupText(payload: TransferPayload, savedAt: number) {
  const images = referencedImages(payload.indexedDB);
  if (images.size === 0) return JSON.stringify({ format: AUTO_BACKUP_FORMAT, version: INLINE_VERSION, savedAt, payload });
  const imageBytes = [...images.values()].reduce((sum, size) => sum + size, 0);
  return JSON.stringify({ format: AUTO_BACKUP_FORMAT, version: SHARED_VERSION, savedAt, imageBytes, payload });
}

// Reads a backup file's text back into the payload to restore; anything that is not one of ours is refused. Pictures of a
// version 2 file are still references here; readBackup fills them in.
export function readBackupText(text: string): TransferPayload {
  return parseBackupText(text, AUTO_BACKUP_FORMAT, [INLINE_VERSION, SHARED_VERSION]);
}

// Puts each shared picture file's bytes in place of its reference, checking its size and SHA-256 first.
export async function resolveImages(payload: TransferPayload, images: ImageFiles | undefined): Promise<TransferPayload> {
  const missing = () => new TransferError("这份备份里有图片文件找不到或已损坏，现有内容没有改动");
  let read = 0;
  const resolve = async (value: Wire): Promise<Wire> => {
    if (isRef(value)) {
      if (!images || !isImageFileName(value.$ref)) throw missing();
      let bytes: Uint8Array;
      try { bytes = await images.read(value.$ref); } catch { throw missing(); }
      if (bytes.byteLength !== value.size || `${await sha256Hex(bytes)}.bin` !== value.$ref) throw missing();
      if ((read += 1) % BATCH === 0) await pause();
      return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer ? bytes.buffer : new Uint8Array(bytes).buffer;
    }
    if (Array.isArray(value)) {
      const out: Wire[] = [];
      for (const inner of value) out.push(await resolve(inner));
      return out;
    }
    if (value && typeof value === "object" && !(value instanceof ArrayBuffer)) {
      const out: Record<string, Wire> = {};
      for (const [key, inner] of Object.entries(value)) out[key] = await resolve(inner as Wire);
      return out;
    }
    return value;
  };
  const indexedDB: TransferPayload["indexedDB"] = {};
  for (const [name, tables] of Object.entries(payload.indexedDB)) {
    indexedDB[name] = {};
    for (const [table, rows] of Object.entries(tables)) indexedDB[name][table] = (await resolve(rows)) as Wire[];
  }
  return { localStorage: payload.localStorage, indexedDB };
}

// One saved day, ready for applyPayload: works for files from before D-043 (pictures inside) and after (shared files).
export async function readBackup(store: BackupStore, name: string): Promise<TransferPayload> {
  return resolveImages(readBackupText(await store.read(name)), store.images);
}

// The size shown in the list: the day file plus the pictures it points at.
export async function backupFullSize(store: BackupStore, file: BackupFile): Promise<number> {
  try {
    const parsed = JSON.parse(await store.read(file.name)) as { imageBytes?: unknown };
    return file.size + (typeof parsed?.imageBytes === "number" ? parsed.imageBytes : 0);
  } catch {
    return file.size;
  }
}

// Removes the shared picture files that no kept day points at. Any unreadable day file stops it: nothing is removed then.
export async function pruneImageFiles(store: BackupStore): Promise<void> {
  if (!store.images) return;
  const keep = new Set<string>();
  for (const file of await store.list()) {
    const parsed = JSON.parse(await store.read(file.name)) as { payload?: { indexedDB?: unknown } };
    for (const name of referencedImages(parsed?.payload?.indexedDB).keys()) keep.add(name);
  }
  await store.images.prune([...keep]);
}

// Saves today's backup when it is switched on and today's is not there yet. Never throws: a failed backup must not disturb
// the app, but it is remembered (AUTO_BACKUP_ERROR_KEY) so 设置 can say so, until a later one succeeds.
export async function runAutoBackup(
  store: BackupStore,
  enabled: boolean,
  now: Date = new Date(),
  collect: (images?: ImageFiles) => Promise<TransferPayload> = (images) => collectBackup(images),
  prefs: Prefs | null = browserPrefs(),
): Promise<"saved" | "skipped" | "failed"> {
  if (!enabled) return "skipped";
  try {
    if (!backupDue((await store.list()).map((file) => file.name), now)) return "skipped";
    await store.save(autoBackupName(now), backupText(await collect(store.images), now.getTime()));
  } catch (error) {
    try { prefs?.setItem(AUTO_BACKUP_ERROR_KEY, JSON.stringify({ at: now.getTime(), reason: backupFailureReason(error) } satisfies BackupError)); } catch { /* nowhere to note it */ }
    return "failed";
  }
  try { prefs?.removeItem(AUTO_BACKUP_ERROR_KEY); } catch { /* ignore */ }
  // Tidying the picture files is not part of the backup: if it fails, the next day tries again.
  await pruneImageFiles(store).catch(() => undefined);
  return "saved";
}

export function describeBackup(payload: TransferPayload) {
  return { images: countImages(payload), ...countPayload(payload) };
}
