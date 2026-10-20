// Moves the 账号 data between the device key and the account key K (see account-lock.ts, version 2). Three stores hold it:
// 保险箱 items, 验证码 and the site-icon cache. Every move is: read everything, write it under the new key, read it back and
// compare. A raw copy of the three stores is taken first and kept (`clipbox.account-premigration.v1`) so nothing can be lost.
// That copy is still under the device key, so it is deleted by itself once the data has opened fine with K in three later app
// sessions (D-042), or earlier by hand in 设置.
import { ACCOUNT_LOCK_KEY, ENCRYPTED_LOCK_MIN, type LockStorage, encryptedPhase, lockMode, markEncryptedMigrating, markEncryptedReady, newDataKey, newRecoveryCode, unlockEncrypted, writeEncryptedLock } from "./account-lock.ts";
import { SECRET_ITEMS_KEY, openSecretItemsStore } from "./secret-items-store.ts";
import { SITE_ICONS_KEY, readSiteIcons, writeSiteIcons } from "./site-icon-store.ts";
import { serialFor } from "./store-queue.ts";
import { TOTP_STORAGE_KEY, openTotpStore } from "./totp-store.ts";

export const PREMIGRATION_KEY = "clipbox.account-premigration.v1";
// How many later app sessions must open the data with K before the copy goes.
export const PREMIGRATION_UNLOCKS_TO_DELETE = 3;
// One id per page load (= one app session). The copy remembers the session that made it and the sessions that counted.
export const APP_SESSION = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
// `session` and `unlocks` were added 2026-10-13; a copy without them was made in an earlier session and has no unlocks counted.
type PremigrationRecord = { version: 1; at: number; data: Record<string, string | null>; session?: string; unlocks?: string[] };
const STORE_KEYS = [SECRET_ITEMS_KEY, TOTP_STORAGE_KEY, SITE_ICONS_KEY] as const;
export type EncryptionStorage = LockStorage & Pick<Storage, "getItem" | "setItem">;

type Snapshot = { items: unknown; totp: unknown; icons: unknown };

async function readAll(key: string, storage: EncryptionStorage): Promise<Snapshot> {
  return {
    items: await openSecretItemsStore(key, storage).list(),
    totp: await openTotpStore(key, storage).list(),
    icons: await readSiteIcons(key, storage),
  };
}

async function writeAll(key: string, data: Snapshot, storage: EncryptionStorage) {
  const items = data.items as Parameters<ReturnType<typeof openSecretItemsStore>["replaceAll"]>[0];
  const totp = data.totp as Parameters<ReturnType<typeof openTotpStore>["replaceAll"]>[0];
  if (items.length > 0) await openSecretItemsStore(key, storage).replaceAll(items);
  else storage.removeItem(SECRET_ITEMS_KEY);
  if (totp.length > 0) await openTotpStore(key, storage).replaceAll(totp);
  else storage.removeItem(TOTP_STORAGE_KEY);
  const icons = data.icons as Record<string, { data: string; at: number }>;
  if (Object.keys(icons).length > 0) await writeSiteIcons(key, icons, storage);
  else storage.removeItem(SITE_ICONS_KEY);
}

// A move holds the 账号 and 验证码 save queues from its first read to its last write, so a cloud merge waits instead of landing
// in between and being overwritten by the old list (audit #7). Inside, the stores run on a stand-in for the same storage: queues
// belong to the storage object, so the move's own reads and writes don't wait behind the move itself.
function exclusive<T>(storage: EncryptionStorage, task: (inner: EncryptionStorage) => Promise<T>): Promise<T> {
  const inner: EncryptionStorage = { getItem: (key) => storage.getItem(key), setItem: (key, value) => storage.setItem(key, value), removeItem: (key) => storage.removeItem(key) };
  return serialFor(storage, SECRET_ITEMS_KEY)(() => serialFor(storage, TOTP_STORAGE_KEY)(() => task(inner)));
}

function rawCopy(storage: EncryptionStorage): Record<string, string | null> {
  return Object.fromEntries(STORE_KEYS.map((key) => [key, storage.getItem(key)]));
}

function restoreRaw(copy: Record<string, string | null>, storage: EncryptionStorage) {
  for (const key of STORE_KEYS) {
    const value = copy[key];
    if (value === null || value === undefined) storage.removeItem(key);
    else storage.setItem(key, value);
  }
}

export function hasPremigrationBackup(storage: EncryptionStorage = localStorage): boolean {
  try { return Boolean(storage.getItem(PREMIGRATION_KEY)); } catch { return false; }
}

export function deletePremigrationBackup(storage: EncryptionStorage = localStorage): void {
  storage.removeItem(PREMIGRATION_KEY);
}

export type PremigrationUnlock = "none" | "pending" | "same-session" | "already-counted" | "unreadable" | "counted" | "deleted";

// Called after the 账号 page was opened with K. Counts this app session toward deleting the pre-migration copy, and deletes it on
// the third later session. Nothing is counted (and nothing deleted) unless the migration is finished and every store just read
// fine with K; the session that made the copy never counts.
export async function notePremigrationUnlock(dataKey: string, storage: EncryptionStorage = localStorage, session: string = APP_SESSION): Promise<PremigrationUnlock> {
  if (!storage.getItem(PREMIGRATION_KEY)) return "none";
  if (lockMode(storage) !== "encrypted" || encryptedPhase(storage) !== "ready") return "pending";
  const record = readPremigration(storage);
  if (!record) return "unreadable";
  if (record.session === session) return "same-session";
  if ((record.unlocks ?? []).includes(session)) return "already-counted";
  try {
    await readAll(dataKey, storage); // items and 验证码 throw unless they open with K
  } catch {
    return "unreadable";
  }
  const latest = readPremigration(storage); // it may have been deleted by hand meanwhile
  if (!latest) return "none";
  const unlocks = [...(latest.unlocks ?? []).filter((id) => id !== session), session];
  if (unlocks.length >= PREMIGRATION_UNLOCKS_TO_DELETE) {
    storage.removeItem(PREMIGRATION_KEY);
    return "deleted";
  }
  storage.setItem(PREMIGRATION_KEY, JSON.stringify({ ...latest, unlocks }));
  return "counted";
}

function readPremigration(storage: EncryptionStorage): PremigrationRecord | null {
  try {
    const parsed = JSON.parse(storage.getItem(PREMIGRATION_KEY) || "null") as Partial<PremigrationRecord> | null;
    if (!parsed || typeof parsed !== "object" || !parsed.data) return null;
    return { ...parsed, unlocks: Array.isArray(parsed.unlocks) ? parsed.unlocks.filter((id): id is string => typeof id === "string") : [] } as PremigrationRecord;
  } catch {
    return null;
  }
}

// Turn the password into real encryption (or upgrade the old door-only password). Returns the recovery code, shown once.
// Anything that goes wrong puts the stores and the old lock record back exactly as they were.
export async function enableAccountEncryption(args: { deviceKey: string; password: string; email?: string }, storage: EncryptionStorage = localStorage): Promise<{ recoveryCode: string; dataKey: string }> {
  if (Array.from(args.password).length < ENCRYPTED_LOCK_MIN) throw new Error(`密码至少 ${ENCRYPTED_LOCK_MIN} 位`);
  return exclusive(storage, (inner) => enableHeld(args, inner));
}

async function enableHeld(args: { deviceKey: string; password: string; email?: string }, storage: EncryptionStorage): Promise<{ recoveryCode: string; dataKey: string }> {
  const { deviceKey, password, email } = args;
  if (lockMode(storage) === "encrypted") throw new Error("已经加密过了");
  const before = await readAll(deviceKey, storage); // if this fails nothing has been touched
  const raw = rawCopy(storage);
  const oldLock = storage.getItem(ACCOUNT_LOCK_KEY);
  const copy: PremigrationRecord = { version: 1, at: Date.now(), data: raw, session: APP_SESSION, unlocks: [] };
  storage.setItem(PREMIGRATION_KEY, JSON.stringify(copy));
  const dataKey = newDataKey();
  const recoveryCode = newRecoveryCode();
  try {
    await writeEncryptedLock({ dataKey, password, recoveryCode, email, phase: "migrating" }, storage);
    await writeAll(dataKey, before, storage);
    const after = await readAll(dataKey, storage);
    if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error("加密后核对不一致");
    await markEncryptedReady(storage);
  } catch (error) {
    restoreRaw(raw, storage);
    if (oldLock === null) storage.removeItem(ACCOUNT_LOCK_KEY);
    else storage.setItem(ACCOUNT_LOCK_KEY, oldLock);
    storage.removeItem(PREMIGRATION_KEY);
    throw new Error("没能加密，数据和密码都没有改动", { cause: error });
  }
  return { recoveryCode, dataKey };
}

// After an interrupted change: each store is read with K, or else with the device key and written again under K.
export async function finishAccountMigration(deviceKey: string, dataKey: string, storage: EncryptionStorage = localStorage): Promise<void> {
  if (encryptedPhase(storage) === "ready") return;
  return exclusive(storage, (inner) => finishHeld(deviceKey, dataKey, inner));
}

async function finishHeld(deviceKey: string, dataKey: string, storage: EncryptionStorage): Promise<void> {
  if (encryptedPhase(storage) === "ready") return;
  const items = await readWithFallback(() => openSecretItemsStore(dataKey, storage).list(), () => openSecretItemsStore(deviceKey, storage).list());
  const totp = await readWithFallback(() => openTotpStore(dataKey, storage).list(), () => openTotpStore(deviceKey, storage).list());
  // The icon cache never throws (an unreadable cache is just empty), so "nothing under K" is what falls back to the device key.
  const iconsNew = await readSiteIcons(dataKey, storage);
  const icons = Object.keys(iconsNew).length > 0 ? iconsNew : await readSiteIcons(deviceKey, storage);
  await writeAll(dataKey, { items, totp, icons }, storage);
  await markEncryptedReady(storage);
}

async function readWithFallback<T>(first: () => Promise<T>, second: () => Promise<T>): Promise<T> {
  try { return await first(); } catch { return second(); }
}

// Turn the encryption off again: the data goes back under the device key, then the lock record is removed.
export async function disableAccountEncryption(args: { deviceKey: string; password: string }, storage: EncryptionStorage = localStorage): Promise<void> {
  const dataKey = await unlockEncrypted(args.password, storage);
  if (dataKey === null) throw new Error("现在的密码不对");
  return exclusive(storage, (inner) => disableHeld(args.deviceKey, dataKey, inner));
}

async function disableHeld(deviceKey: string, dataKey: string, storage: EncryptionStorage): Promise<void> {
  await finishHeld(deviceKey, dataKey, storage);
  const data = await readAll(dataKey, storage);
  const raw = rawCopy(storage);
  // Until the lock is removed, an interrupted disable resumes the existing migration back to K.
  // Keep both wrapped keys intact; no old upgrade backup or new storage format is needed.
  markEncryptedMigrating(storage);
  try {
    await writeAll(deviceKey, data, storage);
    if (JSON.stringify(await readAll(deviceKey, storage)) !== JSON.stringify(data)) throw new Error("核对不一致");
    storage.removeItem(ACCOUNT_LOCK_KEY);
  } catch (error) {
    restoreRaw(raw, storage);
    await markEncryptedReady(storage);
    throw new Error("没能关闭，数据没有改动", { cause: error });
  }
}
