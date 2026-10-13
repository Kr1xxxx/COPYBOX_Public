// Moves the 账号 data between the device key and the account key K (see account-lock.ts, version 2). Three stores hold it:
// 保险箱 items, 验证码 and the site-icon cache. Every move is: read everything, write it under the new key, read it back and
// compare. A raw copy of the three stores is taken first and kept (`clipbox.account-premigration.v1`) so nothing can be lost.
import { ACCOUNT_LOCK_KEY, ENCRYPTED_LOCK_MIN, type LockStorage, encryptedPhase, lockMode, markEncryptedMigrating, markEncryptedReady, newDataKey, newRecoveryCode, unlockEncrypted, writeEncryptedLock } from "./account-lock.ts";
import { SECRET_ITEMS_KEY, openSecretItemsStore } from "./secret-items-store.ts";
import { SITE_ICONS_KEY, readSiteIcons, writeSiteIcons } from "./site-icon-store.ts";
import { TOTP_STORAGE_KEY, openTotpStore } from "./totp-store.ts";

export const PREMIGRATION_KEY = "clipbox.account-premigration.v1";
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

// Turn the password into real encryption (or upgrade the old door-only password). Returns the recovery code, shown once.
// Anything that goes wrong puts the stores and the old lock record back exactly as they were.
export async function enableAccountEncryption(args: { deviceKey: string; password: string; email?: string }, storage: EncryptionStorage = localStorage): Promise<{ recoveryCode: string; dataKey: string }> {
  const { deviceKey, password, email } = args;
  if (Array.from(password).length < ENCRYPTED_LOCK_MIN) throw new Error(`密码至少 ${ENCRYPTED_LOCK_MIN} 位`);
  if (lockMode(storage) === "encrypted") throw new Error("已经加密过了");
  const before = await readAll(deviceKey, storage); // if this fails nothing has been touched
  const raw = rawCopy(storage);
  const oldLock = storage.getItem(ACCOUNT_LOCK_KEY);
  storage.setItem(PREMIGRATION_KEY, JSON.stringify({ version: 1, at: Date.now(), data: raw }));
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
  await finishAccountMigration(args.deviceKey, dataKey, storage);
  const data = await readAll(dataKey, storage);
  const raw = rawCopy(storage);
  // Until the lock is removed, an interrupted disable resumes the existing migration back to K.
  // Keep both wrapped keys intact; no old upgrade backup or new storage format is needed.
  markEncryptedMigrating(storage);
  try {
    await writeAll(args.deviceKey, data, storage);
    if (JSON.stringify(await readAll(args.deviceKey, storage)) !== JSON.stringify(data)) throw new Error("核对不一致");
    storage.removeItem(ACCOUNT_LOCK_KEY);
  } catch (error) {
    restoreRaw(raw, storage);
    await markEncryptedReady(storage);
    throw new Error("没能关闭，数据没有改动", { cause: error });
  }
}
