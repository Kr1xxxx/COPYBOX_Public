// A password for opening the 账号 page, on both platforms. It only decides whether the page is shown: the data itself stays
// encrypted exactly as before (storage keys and backups are untouched), so the password is a door, not a second key.
// What is stored is a salted PBKDF2 hash, never the password.
export const ACCOUNT_LOCK_KEY = "clipbox.account-lock.v1";
export const ACCOUNT_LOCK_MIN = 4;
// A password that encrypts the data must be harder to guess than one that only guards the door.
export const ENCRYPTED_LOCK_MIN = 8;
const ITERATIONS = 210_000;

type LockRecord = { version: 1; salt: string; hash: string; iterations: number; email?: string };
// Version 2: the password really protects the data. The account stores are encrypted with a random key K; the record only
// holds K wrapped by the password and, separately, by a recovery code (so a forgotten password never loses the data).
export type Wrapped = { salt: string; iv: string; ct: string; iterations: number };
// codeShown: false from the moment a recovery code is made until the user ticks that they saved it. A record without the field
// (made before 2026-10-13) counts as saved. While it is false, the next unlock with the password replaces the code with a new one
// and shows it (the old one is not stored in plain text, so it cannot be shown again). D-042.
export type EncryptedLockRecord = { version: 2; wrapPw: Wrapped; wrapRecovery: Wrapped; email?: string; phase: "migrating" | "ready"; at: number; codeShown?: boolean };
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

function readEncrypted(storage: LockStorage): EncryptedLockRecord | null {
  try {
    const parsed = JSON.parse(storage.getItem(ACCOUNT_LOCK_KEY) || "null") as Partial<EncryptedLockRecord> | null;
    if (parsed && parsed.version === 2 && parsed.wrapPw && parsed.wrapRecovery) return parsed as EncryptedLockRecord;
  } catch { /* not a version 2 record */ }
  return null;
}

// none = no password; door = the old password that only guards opening; encrypted = the password also encrypts the data.
export type LockMode = "none" | "door" | "encrypted";
export function lockMode(storage: LockStorage = localStorage): LockMode {
  if (!isAccountLockSet(storage)) return "none";
  return readEncrypted(storage) ? "encrypted" : "door";
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
  return readEncrypted(storage)?.email ?? read(storage)?.email ?? "";
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
  const encrypted = readEncrypted(storage);
  if (encrypted) {
    const value = email.trim();
    if (checkRecoveryEmail(email)) throw new Error(checkRecoveryEmail(email));
    const { email: _gone, ...rest } = encrypted;
    void _gone;
    storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify(value ? { ...rest, email: value } : rest));
    return;
  }
  const record = read(storage);
  if (!record) return;
  const problem = checkRecoveryEmail(email);
  if (problem) throw new Error(problem);
  const { email: _old, ...rest } = record;
  void _old;
  const value = email.trim();
  storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify(value ? { ...rest, email: value } : rest));
}

// ---- version 2: key wrapping --------------------------------------------------------------------------------------------

const WRAP_LABEL = new TextEncoder().encode("clipbox-account-lock:wrap");
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function wrapKey(secret: string, passphrase: string): Promise<Wrapped> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: WRAP_LABEL }, key, new TextEncoder().encode(secret)));
  return { salt: toBase64(salt), iv: toBase64(iv), ct: toBase64(ct), iterations: ITERATIONS };
}

// null = wrong passphrase (AES-GCM refuses to open it).
async function unwrapKey(wrapped: Wrapped, passphrase: string): Promise<string | null> {
  try {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: fromBase64(wrapped.salt) as Uint8Array<ArrayBuffer>, iterations: wrapped.iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(wrapped.iv) as Uint8Array<ArrayBuffer>, additionalData: WRAP_LABEL }, key, fromBase64(wrapped.ct) as Uint8Array<ArrayBuffer>);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export function newDataKey(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)));
}

// 20 characters from an alphabet without look-alikes, shown as XXXX-XXXX-XXXX-XXXX-XXXX (100 bits).
export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]);
  return [0, 4, 8, 12, 16].map((start) => chars.slice(start, start + 4).join("")).join("-");
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function writeEncryptedLock(record: { dataKey: string; password: string; recoveryCode: string; email?: string; phase: "migrating" | "ready" }, storage: LockStorage = localStorage): Promise<void> {
  const value: EncryptedLockRecord = {
    version: 2, phase: record.phase, at: Date.now(),
    wrapPw: await wrapKey(record.dataKey, record.password),
    wrapRecovery: await wrapKey(record.dataKey, normalizeRecoveryCode(record.recoveryCode)),
    ...(record.email?.trim() ? { email: record.email.trim() } : {}),
    codeShown: false,
  };
  storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify(value));
}

export function encryptedPhase(storage: LockStorage = localStorage): "migrating" | "ready" | null {
  return readEncrypted(storage)?.phase ?? null;
}

export async function markEncryptedReady(storage: LockStorage = localStorage): Promise<void> {
  const record = readEncrypted(storage);
  if (record && record.phase !== "ready") storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify({ ...record, phase: "ready" }));
}

export function markEncryptedMigrating(storage: LockStorage = localStorage): void {
  const record = readEncrypted(storage);
  if (record) storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify({ ...record, phase: "migrating" }));
}

// The data key if the password is right, otherwise null.
export async function unlockEncrypted(password: string, storage: LockStorage = localStorage): Promise<string | null> {
  const record = readEncrypted(storage);
  return record ? unwrapKey(record.wrapPw, password) : null;
}

// Forgot the password: the recovery code opens the data and sets a new password at once.
export async function resetPasswordWithRecovery(code: string, newPassword: string, storage: LockStorage = localStorage): Promise<string | null> {
  const record = readEncrypted(storage);
  if (!record) return null;
  const dataKey = await unwrapKey(record.wrapRecovery, normalizeRecoveryCode(code));
  if (dataKey === null) return null;
  if (Array.from(newPassword).length < ENCRYPTED_LOCK_MIN) throw new Error(`密码至少 ${ENCRYPTED_LOCK_MIN} 位`);
  // Whoever typed the code has it, so it no longer needs to be shown again.
  storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify({ ...record, wrapPw: await wrapKey(dataKey, newPassword), ...(record.codeShown === false ? { codeShown: true } : {}) }));
  return dataKey;
}

export async function changeEncryptedPassword(oldPassword: string, newPassword: string, storage: LockStorage = localStorage): Promise<string | null> {
  const record = readEncrypted(storage);
  if (!record) return null;
  const dataKey = await unwrapKey(record.wrapPw, oldPassword);
  if (dataKey === null) return null;
  if (Array.from(newPassword).length < ENCRYPTED_LOCK_MIN) throw new Error(`密码至少 ${ENCRYPTED_LOCK_MIN} 位`);
  storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify({ ...record, wrapPw: await wrapKey(dataKey, newPassword) }));
  return dataKey;
}

// A new recovery code (the old one stops working). null = wrong password. It counts as not yet saved until markRecoveryCodeShown.
export async function renewRecoveryCode(password: string, storage: LockStorage = localStorage): Promise<string | null> {
  const record = readEncrypted(storage);
  if (!record) return null;
  const dataKey = await unwrapKey(record.wrapPw, password);
  if (dataKey === null) return null;
  const code = newRecoveryCode();
  storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify({ ...record, wrapRecovery: await wrapKey(dataKey, normalizeRecoveryCode(code)), codeShown: false }));
  return code;
}

// True while the current recovery code was made but the user has not confirmed saving it (only version 2 records; old records
// without the field count as saved).
export function recoveryCodePending(storage: LockStorage = localStorage): boolean {
  return readEncrypted(storage)?.codeShown === false;
}

// The user ticked 「我已经把恢复码保存好了」 and pressed 完成.
export function markRecoveryCodeShown(storage: LockStorage = localStorage): void {
  const record = readEncrypted(storage);
  if (record && record.codeShown === false) storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify({ ...record, codeShown: true }));
}

// Called right after a successful unlock with the password: when the last code was never confirmed (the app stopped, or 设置 was
// closed while it was on screen), a new code replaces it and is returned to be shown. null = nothing to show.
export async function renewUnseenRecoveryCode(password: string, storage: LockStorage = localStorage): Promise<string | null> {
  return recoveryCodePending(storage) ? renewRecoveryCode(password, storage) : null;
}
