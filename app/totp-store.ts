// Encrypted store for the hidden 验证码 accounts (Mac). One AES-GCM envelope in its own localStorage key, keyed from the
// device key by PBKDF2 like the vault, but kept apart from it: never in the vault and never in a backup file.
import { TOTP_MAX_ACCOUNTS, type TotpAccount } from "./totp-core.ts";

export const TOTP_STORAGE_KEY = "clipbox.totp.v1";
const ITERATIONS = 310_000;
const LABEL = new TextEncoder().encode("clipbox-totp:accounts");

type Envelope = { version: 1; salt: string; iv: string; ciphertext: string; iterations: number };

export type TotpStore = {
  list(): Promise<TotpAccount[]>;
  add(account: TotpAccount): Promise<TotpAccount[]>;
  remove(id: string): Promise<TotpAccount[]>;
};

export type TotpStorage = Pick<Storage, "getItem" | "setItem">;

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

export function openTotpStore(deviceKey: string, storage: TotpStorage = localStorage): TotpStore {
  async function read(): Promise<TotpAccount[]> {
    const raw = storage.getItem(TOTP_STORAGE_KEY);
    if (!raw) return [];
    const envelope = JSON.parse(raw) as Envelope;
    const key = await deriveKey(deviceKey, base64ToBytes(envelope.salt), envelope.iterations);
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv), additionalData: LABEL }, key, base64ToBytes(envelope.ciphertext));
      return (JSON.parse(new TextDecoder().decode(plain)) as { accounts: TotpAccount[] }).accounts;
    } catch (error) {
      throw new Error("验证码数据无法读取，数据没有改动", { cause: error });
    }
  }

  async function write(accounts: TotpAccount[]) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(deviceKey, salt, ITERATIONS);
    const plain = new TextEncoder().encode(JSON.stringify({ accounts }));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: LABEL }, key, plain);
    const envelope: Envelope = { version: 1, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(encrypted)), iterations: ITERATIONS };
    storage.setItem(TOTP_STORAGE_KEY, JSON.stringify(envelope));
    return accounts;
  }

  // Changes are applied one after another so two quick adds cannot overwrite each other.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  }

  return {
    list: () => serial(read),
    add: (account) => serial(async () => {
      const accounts = await read();
      if (accounts.length >= TOTP_MAX_ACCOUNTS) throw new Error(`最多保存 ${TOTP_MAX_ACCOUNTS} 个账号`);
      if (accounts.some((entry) => entry.secret === account.secret && entry.issuer === account.issuer && entry.name === account.name)) throw new Error("这个账号已经添加过了");
      return write([...accounts, account]);
    }),
    remove: (id) => serial(async () => write((await read()).filter((entry) => entry.id !== id))),
  };
}
