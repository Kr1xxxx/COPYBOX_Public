// 保险箱 in a 秘密 backup (Mac). The 验证码 accounts and the typed items travel as one extra block next to the usual
// vault envelope: AES-GCM, key from the backup password (PBKDF2), so they are as private as the rest of the file.
// Backups without the block (all older ones) restore exactly as before.
import type { TotpAccount } from "./totp-core.ts";
import type { VaultItem } from "./secret-items-store.ts";

export type VaultBoxPayload = { totp: TotpAccount[]; items: VaultItem[] };
export type VaultBoxEnvelope = { version: 1; salt: string; iv: string; ciphertext: string; iterations: number };

const ITERATIONS = 310_000;
const LABEL = new TextEncoder().encode("clipbox-vault-box:backup");

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export function isVaultBoxEmpty(payload: VaultBoxPayload) {
  return payload.totp.length === 0 && payload.items.length === 0;
}

export async function encryptVaultBox(payload: VaultBoxPayload, password: string): Promise<VaultBoxEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: LABEL }, key, new TextEncoder().encode(JSON.stringify(payload)));
  return { version: 1, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted)), iterations: ITERATIONS };
}

export function looksLikeVaultBox(value: unknown): value is VaultBoxEnvelope {
  const box = value as Partial<VaultBoxEnvelope> | null;
  return !!box && box.version === 1 && typeof box.salt === "string" && typeof box.iv === "string" && typeof box.ciphertext === "string" && typeof box.iterations === "number";
}

export async function decryptVaultBox(envelope: VaultBoxEnvelope, password: string): Promise<VaultBoxPayload> {
  const key = await deriveKey(password, fromBase64(envelope.salt), envelope.iterations);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(envelope.iv), additionalData: LABEL }, key, fromBase64(envelope.ciphertext));
  const parsed = JSON.parse(new TextDecoder().decode(plain)) as Partial<VaultBoxPayload>;
  return { totp: Array.isArray(parsed.totp) ? parsed.totp : [], items: Array.isArray(parsed.items) ? parsed.items : [] };
}

// "replace" makes the vault equal to the backup; "merge" keeps what is here and adds what is missing.
export function mergeVaultBox(current: VaultBoxPayload, incoming: VaultBoxPayload, strategy: "merge" | "replace"): VaultBoxPayload {
  if (strategy === "replace") return incoming;
  const sameAccount = (a: TotpAccount, b: TotpAccount) => a.id === b.id || (a.secret === b.secret && a.issuer === b.issuer && a.name === b.name);
  const totp = [...current.totp];
  for (const account of incoming.totp) if (!totp.some((entry) => sameAccount(entry, account))) totp.push(account);
  const ids = new Set(current.items.map((item) => item.id));
  const items = [...current.items, ...incoming.items.filter((item) => !ids.has(item.id))];
  return { totp, items };
}
