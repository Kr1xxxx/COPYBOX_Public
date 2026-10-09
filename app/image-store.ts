// Encrypted image store for the 图片 section (docs/specs/image-section.md, "Storage").
// Lives in IndexedDB `clipbox-images`; never touches the vault (`clipbox.vault.v1`).

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const IMAGE_TITLE_MAX = 40;
export const IMAGE_FOLDER_MAX = 30;
export const IMAGE_FOLDER_NAME_MAX = 20;

const DB_NAME = "clipbox-images";
const DB_VERSION = 1;
const SETTINGS_ID = "settings";
const FOLDERS_ID = "folders";
const ITERATIONS = 310_000;

export type ImageMeta = {
  id: string;
  title: string;
  type: string;
  size: number;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  folder?: string;
};

export type ImageFolder = { name: string; color?: string };

export type ImageStore = {
  list(): Promise<ImageMeta[]>;
  add(file: Blob, title: string, folder?: string | null): Promise<ImageMeta>;
  rename(id: string, title: string): Promise<ImageMeta>;
  remove(id: string): Promise<void>;
  getBlob(id: string): Promise<Blob>;
  markUsed(id: string): Promise<void>;
  moveImage(id: string, folder: string | null): Promise<ImageMeta>;
  listFolders(): Promise<ImageFolder[]>;
  createFolder(name: string): Promise<ImageFolder[]>;
  renameFolder(from: string, to: string): Promise<ImageFolder[]>;
  setFolderColor(name: string, color: string): Promise<ImageFolder[]>;
  deleteFolder(name: string): Promise<ImageFolder[]>;
};

export type ImageStoreOptions = {
  indexedDB?: IDBFactory;
  now?: () => number;
  createId?: () => string;
};

type MetaRecord = { id: string; iv: string; ciphertext: string };
type BlobRecord = { id: string; iv: string; ciphertext: ArrayBuffer };
type SettingsRecord = { id: typeof SETTINGS_ID; salt: string };

export function normalizeImageTitle(raw: string, fallback: string): string {
  const title = raw.trim().replace(/\s+/g, " ");
  return Array.from(title || fallback.trim()).slice(0, IMAGE_TITLE_MAX).join("");
}

function collapseSpaces(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

export function normalizeFolderName(raw: string): string {
  return Array.from(collapseSpaces(raw)).slice(0, IMAGE_FOLDER_NAME_MAX).join("");
}

function isReservedId(id: string) {
  return id === SETTINGS_ID || id === FOLDERS_ID;
}

export function titleFromFileName(name: string): string {
  return name.replace(/\.[^./\\]*$/, "");
}

export function validateImageFile(file: { size: number; type: string }): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return "只支持 PNG、JPG、WebP、GIF 图片";
  if (file.size > IMAGE_MAX_BYTES) return "图片太大，最多 10 MB";
  return null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("图片保存被中断"));
  });
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  const req = factory.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    for (const name of ["meta", "blobs"]) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
    }
  };
  return request(req);
}

async function readOrCreateSalt(db: IDBDatabase): Promise<Uint8Array<ArrayBuffer>> {
  const tx = db.transaction("meta", "readwrite");
  const done = finished(tx);
  const store = tx.objectStore("meta");
  const existing = (await request(store.get(SETTINGS_ID))) as SettingsRecord | undefined;
  let salt: Uint8Array<ArrayBuffer>;
  if (existing) {
    salt = base64ToBytes(existing.salt);
  } else {
    salt = crypto.getRandomValues(new Uint8Array(16));
    store.put({ id: SETTINGS_ID, salt: bytesToBase64(salt) } satisfies SettingsRecord);
  }
  await done;
  return salt;
}

async function deriveImageKey(deviceKey: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(deviceKey), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// The record id and store name are bound in as additional data, so a record cannot be
// swapped onto another id (or a blob passed off as meta) without failing to decrypt.
function recordLabel(kind: "meta" | "blobs", id: string) {
  return new TextEncoder().encode(`clipbox-images:${kind}:${id}`);
}

async function seal(key: CryptoKey, kind: "meta" | "blobs", id: string, plaintext: Uint8Array<ArrayBuffer>) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: recordLabel(kind, id) }, key, plaintext);
  return { id, iv: bytesToBase64(iv), ciphertext };
}

async function unseal(key: CryptoKey, kind: "meta" | "blobs", record: { id: string; iv: string; ciphertext: ArrayBuffer | Uint8Array<ArrayBuffer> }) {
  try {
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(record.iv), additionalData: recordLabel(kind, record.id) },
      key,
      record.ciphertext,
    );
  } catch (error) {
    throw new Error(`有图片无法读取，数据没有改动（${record.id}）`, { cause: error });
  }
}

async function readImageSize(file: Blob) {
  if (typeof createImageBitmap !== "function") return { width: 0, height: 0 };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new Error("这张图片打不开", { cause: error });
  }
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

export async function openImageStore(deviceKey: string, options: ImageStoreOptions = {}): Promise<ImageStore> {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  const now = options.now ?? (() => Date.now());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const db = await openDatabase(factory);
  const key = await deriveImageKey(deviceKey, await readOrCreateSalt(db));

  async function sealMeta(meta: ImageMeta): Promise<MetaRecord> {
    const record = await seal(key, "meta", meta.id, new TextEncoder().encode(JSON.stringify(meta)));
    return { ...record, ciphertext: bytesToBase64(new Uint8Array(record.ciphertext)) };
  }

  async function unsealMeta(record: MetaRecord): Promise<ImageMeta> {
    const plaintext = await unseal(key, "meta", { ...record, ciphertext: base64ToBytes(record.ciphertext) });
    return JSON.parse(new TextDecoder().decode(plaintext)) as ImageMeta;
  }

  async function readMeta(id: string): Promise<ImageMeta> {
    if (isReservedId(id)) throw new Error("找不到这张图片");
    const record = (await request(db.transaction("meta").objectStore("meta").get(id))) as MetaRecord | undefined;
    if (!record) throw new Error("找不到这张图片");
    return unsealMeta(record);
  }

  async function writeMeta(meta: ImageMeta) {
    const record = await sealMeta(meta);
    const tx = db.transaction("meta", "readwrite");
    const done = finished(tx);
    tx.objectStore("meta").put(record);
    await done;
  }

  async function readFolders(): Promise<ImageFolder[]> {
    const record = (await request(db.transaction("meta").objectStore("meta").get(FOLDERS_ID))) as MetaRecord | undefined;
    if (!record) return [];
    const plaintext = await unseal(key, "meta", { ...record, ciphertext: base64ToBytes(record.ciphertext) });
    return (JSON.parse(new TextDecoder().decode(plaintext)) as { folders: ImageFolder[] }).folders;
  }

  async function sealFolders(folders: ImageFolder[]): Promise<MetaRecord> {
    const record = await seal(key, "meta", FOLDERS_ID, new TextEncoder().encode(JSON.stringify({ folders })));
    return { ...record, ciphertext: bytesToBase64(new Uint8Array(record.ciphertext)) };
  }

  // Encrypt everything first, then put it all in one transaction (it would commit while awaiting encryption).
  async function writeMetaRecords(records: MetaRecord[]) {
    const tx = db.transaction("meta", "readwrite");
    const done = finished(tx);
    const store = tx.objectStore("meta");
    for (const record of records) store.put(record);
    await done;
  }

  function findFolder(folders: ImageFolder[], name: string): ImageFolder {
    const wanted = normalizeFolderName(name).toLowerCase();
    const folder = folders.find((entry) => entry.name.toLowerCase() === wanted);
    if (!wanted || !folder) throw new Error("找不到这个目录");
    return folder;
  }

  function checkFolderName(raw: string, folders: ImageFolder[], except?: ImageFolder): string {
    const name = normalizeFolderName(raw);
    if (!name) throw new Error("目录名不能为空");
    if (Array.from(collapseSpaces(raw)).length > IMAGE_FOLDER_NAME_MAX) throw new Error(`目录名最多 ${IMAGE_FOLDER_NAME_MAX} 个字`);
    if (folders.some((entry) => entry !== except && entry.name.toLowerCase() === name.toLowerCase())) throw new Error("目录名已存在");
    return name;
  }

  async function folderNameFor(folder: string | null | undefined): Promise<string | undefined> {
    if (folder == null) return undefined;
    return findFolder(await readFolders(), folder).name;
  }

  async function listImages(): Promise<ImageMeta[]> {
    const records = (await request(db.transaction("meta").objectStore("meta").getAll())) as Array<MetaRecord | SettingsRecord>;
    return Promise.all(records.filter((record): record is MetaRecord => !isReservedId(record.id)).map(unsealMeta));
  }

  // Rewrites the folder registry and, in the same transaction, every image whose folder changes.
  async function updateFolders(folders: ImageFolder[], retag?: (meta: ImageMeta) => ImageMeta | null) {
    const changed = retag ? (await listImages()).map(retag).filter((meta): meta is ImageMeta => meta !== null) : [];
    const records = await Promise.all(changed.map(sealMeta));
    records.push(await sealFolders(folders));
    await writeMetaRecords(records);
    return folders;
  }

  return {
    async list() {
      return (await listImages()).sort((a, b) => b.createdAt - a.createdAt);
    },

    async add(file, title, folder) {
      const problem = validateImageFile(file);
      if (problem) throw new Error(problem);
      const folderName = await folderNameFor(folder);
      const { width, height } = await readImageSize(file);
      const time = now();
      const meta: ImageMeta = {
        id: createId(),
        title: normalizeImageTitle(title, "图片"),
        type: file.type,
        size: file.size,
        width,
        height,
        createdAt: time,
        updatedAt: time,
        ...(folderName ? { folder: folderName } : {}),
      };
      // Encrypt before opening the transaction: IndexedDB commits a transaction that waits on other promises.
      const metaRecord = await sealMeta(meta);
      const blobRecord: BlobRecord = await seal(key, "blobs", meta.id, new Uint8Array(await file.arrayBuffer()));
      const tx = db.transaction(["meta", "blobs"], "readwrite");
      const done = finished(tx);
      tx.objectStore("meta").put(metaRecord);
      tx.objectStore("blobs").put(blobRecord);
      await done;
      return meta;
    },

    async rename(id, title) {
      const meta = await readMeta(id);
      const renamed = { ...meta, title: normalizeImageTitle(title, meta.title), updatedAt: now() };
      await writeMeta(renamed);
      return renamed;
    },

    async remove(id) {
      if (isReservedId(id)) throw new Error("找不到这张图片");
      const tx = db.transaction(["meta", "blobs"], "readwrite");
      const done = finished(tx);
      tx.objectStore("meta").delete(id);
      tx.objectStore("blobs").delete(id);
      await done;
    },

    async getBlob(id) {
      const meta = await readMeta(id);
      const record = (await request(db.transaction("blobs").objectStore("blobs").get(id))) as BlobRecord | undefined;
      if (!record) throw new Error("找不到这张图片");
      return new Blob([await unseal(key, "blobs", record)], { type: meta.type });
    },

    async markUsed(id) {
      const meta = await readMeta(id);
      await writeMeta({ ...meta, lastUsedAt: now() });
    },

    async moveImage(id, folder) {
      const meta = await readMeta(id);
      const folderName = await folderNameFor(folder);
      const moved: ImageMeta = { ...meta, folder: folderName, updatedAt: now() };
      if (!folderName) delete moved.folder;
      await writeMeta(moved);
      return moved;
    },

    listFolders: readFolders,

    async createFolder(raw) {
      const folders = await readFolders();
      const name = checkFolderName(raw, folders);
      if (folders.length >= IMAGE_FOLDER_MAX) throw new Error(`目录最多 ${IMAGE_FOLDER_MAX} 个`);
      return updateFolders([...folders, { name }]);
    },

    async renameFolder(from, to) {
      const folders = await readFolders();
      const target = findFolder(folders, from);
      const name = checkFolderName(to, folders, target);
      const time = now();
      return updateFolders(
        folders.map((entry) => (entry === target ? { ...entry, name } : entry)),
        (meta) => (meta.folder === target.name ? { ...meta, folder: name, updatedAt: time } : null),
      );
    },

    async setFolderColor(name, color) {
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("颜色不对");
      const folders = await readFolders();
      const target = findFolder(folders, name);
      return updateFolders(folders.map((entry) => (entry === target ? { ...entry, color } : entry)));
    },

    async deleteFolder(name) {
      const folders = await readFolders();
      const target = findFolder(folders, name);
      const time = now();
      return updateFolders(
        folders.filter((entry) => entry !== target),
        ({ folder, ...rest }) => (folder === target.name ? { ...rest, updatedAt: time } : null),
      );
    },
  };
}

export async function toPngBytes(blob: Blob): Promise<Uint8Array> {
  if (blob.type === "image/png") return new Uint8Array(await blob.arrayBuffer());
  const bitmap = await createImageBitmap(blob);
  try {
    let png: Blob | null;
    if (typeof OffscreenCanvas === "function") {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("这张图片无法复制");
      context.drawImage(bitmap, 0, 0);
      png = await canvas.convertToBlob({ type: "image/png" });
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("这张图片无法复制");
      context.drawImage(bitmap, 0, 0);
      png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    }
    if (!png) throw new Error("这张图片无法复制");
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    bitmap.close();
  }
}
