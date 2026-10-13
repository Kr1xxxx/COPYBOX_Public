// Moves everything Clipbox keeps in the page (localStorage + the two image databases) into one password-protected file and
// back. Used once, when changing from the Electron app to the Tauri app: the new app has a different page origin, so it
// cannot see the old data by itself. Records are copied as they are (already-encrypted stays encrypted), so nothing is
// re-encrypted or interpreted here; the file as a whole is sealed with a password on top.

import { quiesceWrites, reopenWrites } from "./write-gate.ts";

export class TransferError extends Error {}

// The copy of the current data taken before an import lives in its own small database until the import has finished,
// so a power cut half-way leaves something to restore from (see restoreStashedBackup). It is not part of any export.
const STASH_DB = "clipbox-import-backup";
const STASH_ID = "last";

export const TRANSFER_FORMAT = "clipbox-data-move";
export const TRANSFER_VERSION = 1;
const ITERATIONS = 600_000;
const KEY_PREFIX = "clipbox.";
// The browser build keeps its AI key in plain text in localStorage; it never travels. Desktop builds keep it in the OS store.
// The browser build's own list of automatic backups never goes inside a backup.
const SKIPPED_KEYS = new Set(["clipbox.ai-key.web.v1", "clipbox.web-backups.v1"]);
// Kept on this device only (D-043): never copied into any backup, and dropped when an older backup file still carries them. The pre-migration copy of the 账号 data is encrypted with the device key only, so
// putting it next to the device key in an automatic backup would undo D-040; the last auto-backup error is about this device.
export const LOCAL_ONLY_KEYS = new Set(["clipbox.account-premigration.v1", "clipbox.auto-backup.last-error"]);
// Of those, what a restore leaves alone. The pre-migration copy is removed by a restore (as before D-043): it belongs to the
// data being replaced, and the restored device key may not even open it.
const KEPT_BY_RESTORE = new Set(["clipbox.auto-backup.last-error"]);
export const IMAGE_DB = "clipbox-images";
export const THUMB_DB = "clipbox-image-thumbs";
const DATABASES = [IMAGE_DB, THUMB_DB];

// Raw bytes (ArrayBuffer) only appear in memory, after an automatic backup's image files were read back; never in a file.
export type Wire = null | boolean | number | string | ArrayBuffer | { $b64: string } | Wire[] | { [key: string]: Wire };
export type TransferPayload = {
  localStorage: Record<string, string>;
  indexedDB: Record<string, Record<string, Wire[]>>;
};
export type TransferFile = {
  format: typeof TRANSFER_FORMAT;
  version: number;
  createdAt: number;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};
export type TransferCounts = { settings: number; records: number };

export function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(text);
}

export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export function encodeValue(value: unknown): Wire {
  if (value === null || value === undefined) return null;
  if (value instanceof ArrayBuffer) return { $b64: bytesToBase64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) return { $b64: bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, encodeValue(inner)]));
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  throw new TransferError("遇到无法备份的数据");
}

export function decodeValue(wire: Wire): unknown {
  if (wire instanceof ArrayBuffer) return wire;
  if (wire === null || typeof wire !== "object") return wire;
  if (Array.isArray(wire)) return wire.map(decodeValue);
  const keys = Object.keys(wire);
  if (keys.length === 1 && keys[0] === "$b64" && typeof (wire as { $b64: unknown }).$b64 === "string") {
    return base64ToBytes((wire as { $b64: string }).$b64).buffer;
  }
  return Object.fromEntries(Object.entries(wire).map(([key, inner]) => [key, decodeValue(inner as Wire)]));
}

export function countPayload(payload: TransferPayload): TransferCounts {
  let records = 0;
  for (const stores of Object.values(payload.indexedDB)) for (const rows of Object.values(stores)) records += rows.length;
  return { settings: Object.keys(payload.localStorage).length, records };
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("写入被中断"));
  });
}

async function existingDatabases(factory: IDBFactory): Promise<Set<string>> {
  // Not every webview can list databases; the two names are fixed, so fall back to trying both.
  try {
    const list = await factory.databases?.();
    if (list) return new Set(list.map((entry) => entry.name ?? ""));
  } catch { /* try opening instead */ }
  return new Set(DATABASES);
}

// The `clipbox.*` settings a backup carries: not the never-copied ones, not the ones kept on this device only.
export function collectLocal(storage: Storage = localStorage): Record<string, string> {
  const local: Record<string, string> = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(KEY_PREFIX) || SKIPPED_KEYS.has(key) || LOCAL_ONLY_KEYS.has(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) local[key] = value;
  }
  return local;
}

export function listDatabases(factory: IDBFactory = indexedDB): Promise<Set<string>> {
  return existingDatabases(factory);
}

export async function collectPayload(storage: Storage = localStorage, factory: IDBFactory = indexedDB): Promise<TransferPayload> {
  const local = collectLocal(storage);
  const databases: TransferPayload["indexedDB"] = {};
  const present = await existingDatabases(factory);
  for (const name of DATABASES) {
    if (!present.has(name)) continue;
    const db = await request(factory.open(name));
    try {
      const stores: Record<string, Wire[]> = {};
      const names = Array.from(db.objectStoreNames);
      if (names.length > 0) {
        const tx = db.transaction(names);
        for (const store of names) stores[store] = (await request(tx.objectStore(store).getAll())).map(encodeValue);
      }
      databases[name] = stores;
    } finally {
      db.close();
    }
  }
  return { localStorage: local, indexedDB: databases };
}

function validatePayload(value: unknown): TransferPayload {
  const payload = value as TransferPayload | null;
  const stores = payload?.indexedDB;
  const local = payload?.localStorage;
  if (!payload || typeof local !== "object" || local === null || typeof stores !== "object" || stores === null) throw new TransferError("文件内容不对");
  for (const [key, text] of Object.entries(local)) {
    if (!key.startsWith(KEY_PREFIX) || SKIPPED_KEYS.has(key) || typeof text !== "string") throw new TransferError("文件内容不对");
  }
  for (const [name, tables] of Object.entries(stores)) {
    if (!DATABASES.includes(name) || typeof tables !== "object" || tables === null) throw new TransferError("文件内容不对");
    for (const rows of Object.values(tables)) if (!Array.isArray(rows)) throw new TransferError("文件内容不对");
  }
  return payload;
}

async function openStash(factory: IDBFactory): Promise<IDBDatabase> {
  const open = factory.open(STASH_DB, 1);
  open.onupgradeneeded = () => {
    if (!open.result.objectStoreNames.contains("backup")) open.result.createObjectStore("backup", { keyPath: "id" });
  };
  return request(open);
}

async function writeStash(factory: IDBFactory, backup: TransferPayload | null): Promise<void> {
  const db = await openStash(factory);
  try {
    const tx = db.transaction("backup", "readwrite");
    const store = tx.objectStore("backup");
    store.clear();
    // Kept as a structured object rather than one JSON string: a string that large can pass the browser's limit.
    if (backup) store.put({ id: STASH_ID, payload: backup });
    await done(tx);
  } finally {
    db.close();
  }
}

export async function hasStashedBackup(factory: IDBFactory = indexedDB): Promise<boolean> {
  try {
    const present = await existingDatabases(factory);
    if (!present.has(STASH_DB)) return false;
    const db = await openStash(factory);
    try {
      return (await request(db.transaction("backup").objectStore("backup").getAll())).length > 0;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

// Puts back what was here before an import that was cut off (power loss, crash). No-op when nothing is stashed.
export async function restoreStashedBackup(storage: Storage = localStorage, factory: IDBFactory = indexedDB): Promise<boolean> {
  const db = await openStash(factory);
  let rows: { json?: string; payload?: unknown }[];
  try {
    rows = (await request(db.transaction("backup").objectStore("backup").getAll())) as { json?: string; payload?: unknown }[];
  } finally {
    db.close();
  }
  // `json` is how the copy was kept before D-043; one can still be waiting after an update.
  const saved = rows[0]?.payload ?? (rows[0]?.json ? JSON.parse(rows[0].json) : null);
  if (!saved) return false;
  await writePayload(validatePayload(saved), storage, factory);
  await writeStash(factory, null);
  return true;
}

// An automatic backup file (not password-sealed): checks it is one of ours and its contents are well-formed before anything is restored.
export function parseBackupText(text: string, format: string, versions: readonly number[] = [1]): TransferPayload {
  let file: { format?: unknown; version?: unknown; payload?: unknown };
  try { file = JSON.parse(text); } catch { throw new TransferError("这不是 Clipbox 的备份文件"); }
  if (file?.format !== format || !versions.includes(file.version as number)) throw new TransferError("这不是 Clipbox 的备份文件");
  return validatePayload(file.payload);
}

// What the person sees in the confirmation: pictures only (the two bookkeeping rows are not pictures).
export function countImages(payload: TransferPayload): number {
  const rows = payload.indexedDB[IMAGE_DB]?.meta ?? [];
  return rows.filter((row) => !isBookkeepingId((row as { id?: unknown } | null)?.id)).length;
}

export const isBookkeepingId = (id: unknown) => id === "settings" || id === "folders";

// The same count for the pictures stored here now, reading only the record keys instead of every picture.
export async function countStoredImages(factory: IDBFactory = indexedDB): Promise<number> {
  if (!(await existingDatabases(factory)).has(IMAGE_DB)) return 0;
  const db = await request(factory.open(IMAGE_DB));
  try {
    if (!db.objectStoreNames.contains("meta")) return 0;
    return (await request(db.transaction("meta").objectStore("meta").getAllKeys())).filter((key) => !isBookkeepingId(key)).length;
  } finally {
    db.close();
  }
}

async function writePayload(payload: TransferPayload, storage: Storage, factory: IDBFactory): Promise<void> {
  const present = await existingDatabases(factory);
  for (const name of DATABASES) {
    if (!(name in payload.indexedDB) && !present.has(name)) continue;
    const tables = payload.indexedDB[name] ?? {};
    const open = factory.open(name, 1);
    open.onupgradeneeded = () => {
      const stores = new Set([...(name === "clipbox-images" ? ["meta", "blobs"] : ["thumbs"]), ...Object.keys(tables)]);
      for (const store of stores) if (!open.result.objectStoreNames.contains(store)) open.result.createObjectStore(store, { keyPath: "id" });
    };
    const db = await request(open);
    try {
      // Clear every existing table, including ones absent from this backup. Keep the schema and
      // live image-store connections usable instead of blocking on deleteDatabase.
      const names = Array.from(db.objectStoreNames);
      if (names.length === 0) continue;
      const tx = db.transaction(names, "readwrite");
      for (const store of names) {
        const target = tx.objectStore(store);
        target.clear();
        for (const row of tables[store] ?? []) target.put(decodeValue(row));
      }
      await done(tx);
    } finally {
      db.close();
    }
  }
  const stale: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key.startsWith(KEY_PREFIX) && !SKIPPED_KEYS.has(key) && !KEPT_BY_RESTORE.has(key)) stale.push(key);
  }
  for (const key of stale) storage.removeItem(key);
  for (const [key, text] of Object.entries(payload.localStorage)) if (!LOCAL_ONLY_KEYS.has(key)) storage.setItem(key, text);
}

// Replaces what is stored here with the payload. The databases are written first and the settings last. Before
// anything is touched the current data is copied; if any step fails (disk full, browser refusing a write), the copy is
// written back, so a half-finished import never leaves new images beside the old vault.
export async function applyPayload(input: TransferPayload, storage: Storage = localStorage, factory: IDBFactory = indexedDB): Promise<void> {
  const payload = validatePayload(input);
  await quiesceWrites();
  let backup: TransferPayload;
  try {
    backup = await collectPayload(storage, factory);
    await writeStash(factory, backup);
  } catch {
    reopenWrites();
    throw new TransferError("没能先备份现有内容，所以没有导入。现有内容没有改动。");
  }
  try {
    await writePayload(payload, storage, factory);
  } catch {
    try {
      await writePayload(backup, storage, factory);
      await writeStash(factory, null).catch(() => undefined);
    } catch {
      throw new TransferError("导入中断了，而且没能恢复原来的内容。请不要关闭这个窗口，马上联系管理员。");
    }
    reopenWrites();
    throw new TransferError("导入没有成功（可能是磁盘空间不够）。现有内容已经原样保留，没有改动。");
  }
  await writeStash(factory, null).catch(() => undefined);
}

async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function sealTransfer(payload: TransferPayload, password: string, now = Date.now()): Promise<TransferFile> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt, ITERATIONS);
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`${TRANSFER_FORMAT}:${TRANSFER_VERSION}`) }, key, plain);
  return { format: TRANSFER_FORMAT, version: TRANSFER_VERSION, createdAt: now, iterations: ITERATIONS, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

// The file's text in pieces for a Blob: the same text as JSON.stringify(file) (ciphertext is last there too), without one
// more copy of the large ciphertext. Base64 never needs escaping inside a JSON string.
export function transferFileParts(file: TransferFile): string[] {
  const { ciphertext, ...head } = file;
  return [JSON.stringify(head).slice(0, -1), ',"ciphertext":"', ciphertext, '"}'];
}

export function parseTransferFile(text: string): TransferFile {
  let file: TransferFile;
  try { file = JSON.parse(text) as TransferFile; } catch { throw new TransferError("这不是完整备份文件"); }
  if (file?.format !== TRANSFER_FORMAT) throw new TransferError("这不是完整备份文件");
  if (file.version !== TRANSFER_VERSION) throw new TransferError("这份备份的版本太新，请先更新 Clipbox");
  if (typeof file.salt !== "string" || typeof file.iv !== "string" || typeof file.ciphertext !== "string" || !Number.isInteger(file.iterations) || file.iterations < 1) {
    throw new TransferError("备份文件已损坏");
  }
  return file;
}

export async function openTransfer(file: TransferFile, password: string): Promise<TransferPayload> {
  const key = await passwordKey(password, base64ToBytes(file.salt), file.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(file.iv), additionalData: new TextEncoder().encode(`${TRANSFER_FORMAT}:${file.version}`) }, key, base64ToBytes(file.ciphertext));
  } catch {
    throw new TransferError("密码不对，或文件已损坏");
  }
  return validatePayload(JSON.parse(new TextDecoder().decode(plain)));
}

export function transferFileName(date = new Date()) {
  return `clipbox-full-backup-${date.toISOString().slice(0, 10)}.json`;
}
