// A password for opening the 账号 page, on both platforms. It only decides whether the page is shown: the data itself stays
// encrypted exactly as before (storage keys and backups are untouched), so the password is a door, not a second key.
// What is stored is a salted PBKDF2 hash, never the password.
export const ACCOUNT_LOCK_KEY = "clipbox.account-lock.v1";
export const ACCOUNT_LOCK_MIN = 4;
const ITERATIONS = 210_000;

type LockRecord = { version: 1; salt: string; hash: string; iterations: number; email?: string };
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Empty is fine (no recovery email); otherwise it must look like an address.
export function checkRecoveryEmail(email: string): string {
  const value = email.trim();
  return value === "" || (value.length <= 120 && EMAIL_PATTERN.test(value)) ? "" : "邮箱格式不对";
}

export function getRecoveryEmail(storage: LockStorage = localStorage): string {
  return read(storage)?.email ?? "";
}

// 「a***@x.com」: enough to recognise the address without showing it whole.
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return name && domain ? `${name.slice(0, 1)}***@${domain}` : "";
}

// Where the reset mail is sent from. Empty until the server is deployed; the 忘记密码 button says so in the meantime.
export const RESET_SERVER_URL = "";

export type ResetResult = { ok: true } | { ok: false; reason: "no-email" | "no-server" | "failed" };

export async function requestPasswordReset(storage: LockStorage = localStorage): Promise<ResetResult> {
  const email = getRecoveryEmail(storage);
  if (!email) return { ok: false, reason: "no-email" };
  if (!RESET_SERVER_URL) return { ok: false, reason: "no-server" };
  try {
    const response = await fetch(`${RESET_SERVER_URL}/account-reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    return response.ok ? { ok: true } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export async function setAccountLock(password: string, storage: LockStorage = localStorage, email?: string): Promise<void> {
  const problem = checkNewPassword(password);
  if (problem) throw new Error(problem);
  const emailProblem = email === undefined ? "" : checkRecoveryEmail(email);
  if (emailProblem) throw new Error(emailProblem);
  const kept = email === undefined ? getRecoveryEmail(storage) : email.trim();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const record: LockRecord = { version: 1, salt: toBase64(salt), hash: toBase64(await hashOf(password, salt, ITERATIONS)), iterations: ITERATIONS, ...(kept ? { email: kept } : {}) };
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

// Changes only the recovery email; the password check is untouched.
export function setRecoveryEmail(email: string, storage: LockStorage = localStorage): void {
  const record = read(storage);
  if (!record) return;
  const problem = checkRecoveryEmail(email);
  if (problem) throw new Error(problem);
  const { email: _old, ...rest } = record;
  void _old;
  const value = email.trim();
  storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify(value ? { ...rest, email: value } : rest));
}
