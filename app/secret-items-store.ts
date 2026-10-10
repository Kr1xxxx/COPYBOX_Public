// Encrypted store for the typed items of the hidden 保险箱 (Mac only): 收款信息 now, 账号密码 and API 密钥 later.
// A separate AES-GCM envelope in its own localStorage key. The 验证码 accounts keep their own key (`clipbox.totp.v1`,
// totp-store.ts) and are not touched, so older data stays readable without any migration.
import type { ApiKeyItem, LoginItem, PaymentItem } from "./payment-core.ts";

export const SECRET_ITEMS_KEY = "clipbox.vault-items.v1";
const ITERATIONS = 310_000;
const LABEL = new TextEncoder().encode("clipbox-vault-items:items");

export type VaultItem = PaymentItem | LoginItem | ApiKeyItem;

type Envelope = { version: 1; salt: string; iv: string; ciphertext: string; iterations: number };

export type SecretItemsStore = {
  list(): Promise<VaultItem[]>;
  // Adds the item, or replaces the one with the same id.
  put(item: VaultItem): Promise<VaultItem[]>;
  remove(id: string): Promise<VaultItem[]>;
  // Used when restoring a backup: writes the whole list at once.
  replaceAll(items: VaultItem[]): Promise<VaultItem[]>;
};

export type SecretItemsStorage = Pick<Storage, "getItem" | "setItem">;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveKey(deviceKey: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(deviceKey), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export function openSecretItemsStore(deviceKey: string, storage: SecretItemsStorage = localStorage, maxItems = 200): SecretItemsStore {
  async function read(): Promise<VaultItem[]> {
    const raw = storage.getItem(SECRET_ITEMS_KEY);
    if (!raw) return [];
    const envelope = JSON.parse(raw) as Envelope;
    const key = await deriveKey(deviceKey, base64ToBytes(envelope.salt), envelope.iterations);
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv), additionalData: LABEL }, key, base64ToBytes(envelope.ciphertext));
      return (JSON.parse(new TextDecoder().decode(plain)) as { items: VaultItem[] }).items;
    } catch (error) {
      throw new Error("保险箱数据无法读取，数据没有改动", { cause: error });
    }
  }

  async function write(items: VaultItem[]) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(deviceKey, salt, ITERATIONS);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: LABEL }, key, new TextEncoder().encode(JSON.stringify({ items })));
    const envelope: Envelope = { version: 1, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(encrypted)), iterations: ITERATIONS };
    storage.setItem(SECRET_ITEMS_KEY, JSON.stringify(envelope));
    return items;
  }

  // One change after another, so two quick saves cannot overwrite each other.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  }

  return {
    list: () => serial(read),
    put: (item) => serial(async () => {
      const items = await read();
      const index = items.findIndex((entry) => entry.id === item.id);
      if (index < 0 && items.length >= maxItems) throw new Error(`最多保存 ${maxItems} 条`);
      return write(index < 0 ? [...items, item] : items.map((entry) => (entry.id === item.id ? item : entry)));
    }),
    remove: (id) => serial(async () => write((await read()).filter((entry) => entry.id !== id))),
    replaceAll: (items) => serial(async () => write(items)),
  };
}
