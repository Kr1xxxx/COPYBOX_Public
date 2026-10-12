// A password for opening the 账号 page, on both platforms. It only decides whether the page is shown: the data itself stays
// encrypted exactly as before (storage keys and backups are untouched), so the password is a door, not a second key.
// What is stored is a salted PBKDF2 hash, never the password.
export const ACCOUNT_LOCK_KEY = "clipbox.account-lock.v1";
export const ACCOUNT_LOCK_MIN = 4;
const ITERATIONS = 210_000;

type LockRecord = { version: 1; salt: string; hash: string; iterations: number };
export type LockStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function hashOf(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, 256));
}

function read(storage: LockStorage): LockRecord | null {
  try {
    const parsed = JSON.parse(storage.getItem(ACCOUNT_LOCK_KEY) || "null") as Partial<LockRecord> | null;
    if (parsed && parsed.version === 1 && typeof parsed.salt === "string" && typeof parsed.hash === "string" && typeof parsed.iterations === "number") return parsed as LockRecord;
  } catch { /* unreadable counts as no password set only if it is empty, see isAccountLockSet */ }
  return null;
}

// A damaged record still counts as "set", so a corrupt value can never open the page without a password.
export function isAccountLockSet(storage: LockStorage = localStorage): boolean {
  try { return Boolean(storage.getItem(ACCOUNT_LOCK_KEY)); } catch { return false; }
}

export function checkNewPassword(password: string): string {
  if (Array.from(password).length < ACCOUNT_LOCK_MIN) return `密码至少 ${ACCOUNT_LOCK_MIN} 位`;
  return "";
}

export async function setAccountLock(password: string, storage: LockStorage = localStorage): Promise<void> {
  const problem = checkNewPassword(password);
  if (problem) throw new Error(problem);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const record: LockRecord = { version: 1, salt: toBase64(salt), hash: toBase64(await hashOf(password, salt, ITERATIONS)), iterations: ITERATIONS };
  storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify(record));
}

export async function verifyAccountLock(password: string, storage: LockStorage = localStorage): Promise<boolean> {
  const record = read(storage);
  if (!record) return false;
  const actual = await hashOf(password, fromBase64(record.salt), record.iterations);
  const expected = fromBase64(record.hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < actual.length; index += 1) diff |= actual[index] ^ expected[index];
  return diff === 0;
}

export function removeAccountLock(storage: LockStorage = localStorage): void {
  storage.removeItem(ACCOUNT_LOCK_KEY);
}
