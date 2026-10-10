// Moves everything Clipbox keeps in the page (localStorage + the two image databases) into one password-protected file and
// back. Used once, when changing from the Electron app to the Tauri app: the new app has a different page origin, so it
// cannot see the old data by itself. Records are copied as they are (already-encrypted stays encrypted), so nothing is
// re-encrypted or interpreted here; the file as a whole is sealed with a password on top.

export const TRANSFER_FORMAT = "clipbox-data-move";
export const TRANSFER_VERSION = 1;
const ITERATIONS = 310_000;
const KEY_PREFIX = "clipbox.";
// The browser build keeps its AI key in plain text in localStorage; it never travels. Desktop builds keep it in the OS store.
const SKIPPED_KEYS = new Set(["clipbox.ai-key.web.v1"]);
const DATABASES = ["clipbox-images", "clipbox-image-thumbs"];

type Wire = null | boolean | number | string | { $b64: string } | Wire[] | { [key: string]: Wire };
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
  throw new Error("遇到无法搬家的数据");
}

export function decodeValue(wire: Wire): unknown {
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

export async function collectPayload(storage: Storage = localStorage, factory: IDBFactory = indexedDB): Promise<TransferPayload> {
  const local: Record<string, string> = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(KEY_PREFIX) || SKIPPED_KEYS.has(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) local[key] = value;
  }
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
  if (!payload || typeof local !== "object" || local === null || typeof stores !== "object" || stores === null) throw new Error("文件内容不对");
  for (const [key, text] of Object.entries(local)) {
    if (!key.startsWith(KEY_PREFIX) || SKIPPED_KEYS.has(key) || typeof text !== "string") throw new Error("文件内容不对");
  }
  for (const [name, tables] of Object.entries(stores)) {
    if (!DATABASES.includes(name) || typeof tables !== "object" || tables === null) throw new Error("文件内容不对");
    for (const rows of Object.values(tables)) if (!Array.isArray(rows)) throw new Error("文件内容不对");
  }
  return payload;
}

// Replaces what is stored here with the payload. The databases are written first and the settings last, so a failure
// part-way leaves the old vault key in place instead of a new vault key pointing at missing images.
export async function applyPayload(input: TransferPayload, storage: Storage = localStorage, factory: IDBFactory = indexedDB): Promise<void> {
  const payload = validatePayload(input);
  for (const [name, tables] of Object.entries(payload.indexedDB)) {
    const open = factory.open(name, 1);
    open.onupgradeneeded = () => {
      for (const store of Object.keys(tables)) if (!open.result.objectStoreNames.contains(store)) open.result.createObjectStore(store, { keyPath: "id" });
    };
    const db = await request(open);
    try {
      const names = Object.keys(tables).filter((store) => db.objectStoreNames.contains(store));
      if (names.length === 0) continue;
      const tx = db.transaction(names, "readwrite");
      for (const store of names) {
        const target = tx.objectStore(store);
        target.clear();
        for (const row of tables[store]) target.put(decodeValue(row));
      }
      await done(tx);
    } finally {
      db.close();
    }
  }
  const stale: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key.startsWith(KEY_PREFIX) && !SKIPPED_KEYS.has(key)) stale.push(key);
  }
  for (const key of stale) storage.removeItem(key);
  for (const [key, text] of Object.entries(payload.localStorage)) storage.setItem(key, text);
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

export function parseTransferFile(text: string): TransferFile {
  let file: TransferFile;
  try { file = JSON.parse(text) as TransferFile; } catch { throw new Error("这不是搬家文件"); }
  if (file?.format !== TRANSFER_FORMAT) throw new Error("这不是搬家文件");
  if (file.version !== TRANSFER_VERSION) throw new Error("搬家文件的版本太新，请先更新 Clipbox");
  if (typeof file.salt !== "string" || typeof file.iv !== "string" || typeof file.ciphertext !== "string" || !Number.isInteger(file.iterations) || file.iterations < 1) {
    throw new Error("搬家文件已损坏");
  }
  return file;
}

export async function openTransfer(file: TransferFile, password: string): Promise<TransferPayload> {
  const key = await passwordKey(password, base64ToBytes(file.salt), file.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(file.iv), additionalData: new TextEncoder().encode(`${TRANSFER_FORMAT}:${file.version}`) }, key, base64ToBytes(file.ciphertext));
  } catch {
    throw new Error("密码不对，或文件已损坏");
  }
  return validatePayload(JSON.parse(new TextDecoder().decode(plain)));
}

export function transferFileName(date = new Date()) {
  return `clipbox-data-move-${date.toISOString().slice(0, 10)}.json`;
}
