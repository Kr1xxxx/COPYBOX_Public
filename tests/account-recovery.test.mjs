// D-042: a recovery code that was never confirmed is replaced at the next unlock; the pre-migration copy deletes itself after
// the data opened fine with K in three later app sessions.
import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_LOCK_KEY, changeEncryptedPassword, lockMode, markRecoveryCodeShown, recoveryCodePending, renewRecoveryCode, renewUnseenRecoveryCode, resetPasswordWithRecovery, setAccountLock, setRecoveryEmail, unlockEncrypted, verifyAccountLock } from "../app/account-lock.ts";
import { APP_SESSION, PREMIGRATION_KEY, enableAccountEncryption, finishAccountMigration, hasPremigrationBackup, notePremigrationUnlock } from "../app/account-encryption.ts";
import { SECRET_ITEMS_KEY, openSecretItemsStore } from "../app/secret-items-store.ts";
import { openTotpStore } from "../app/totp-store.ts";

const DEVICE = "device-key-for-tests";
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), raw: m }; };
const login = { id: "l1", type: "login", name: "后台", username: "me@x.test", password: "S3cret-pass", url: "https://x.test", updatedAt: 1 };
const totp = { id: "t1", issuer: "X", name: "me", secret: "MFRGGZDFMZTWQ2LK", digits: 6, period: 30, algorithm: "SHA1" };
const lockRecord = (storage) => JSON.parse(storage.raw.get(ACCOUNT_LOCK_KEY));

async function encrypted() {
  const storage = memory();
  await openSecretItemsStore(DEVICE, storage).replaceAll([login]);
  await openTotpStore(DEVICE, storage).replaceAll([totp]);
  const result = await enableAccountEncryption({ deviceKey: DEVICE, password: "correct horse" }, storage);
  return { storage, ...result };
}

test("the recovery code counts as unseen until the user confirms it, then as seen", async () => {
  const { storage } = await encrypted();
  assert.equal(lockRecord(storage).codeShown, false);
  assert.equal(recoveryCodePending(storage), true);
  markRecoveryCodeShown(storage);
  assert.equal(lockRecord(storage).codeShown, true);
  assert.equal(recoveryCodePending(storage), false);
  // changing the password or the email keeps the flag
  await changeEncryptedPassword("correct horse", "second password", storage);
  setRecoveryEmail("me@x.test", storage);
  assert.equal(lockRecord(storage).codeShown, true);
  // a new code from 设置 is unseen again until confirmed
  await renewRecoveryCode("second password", storage);
  assert.equal(recoveryCodePending(storage), true);
});

test("records made before the field existed count as confirmed and are never rewritten", async () => {
  const { storage } = await encrypted();
  const { codeShown: _gone, ...old } = lockRecord(storage);
  void _gone;
  storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify(old));
  assert.equal(recoveryCodePending(storage), false);
  const before = storage.raw.get(ACCOUNT_LOCK_KEY);
  assert.equal(await renewUnseenRecoveryCode("correct horse", storage), null);
  markRecoveryCodeShown(storage);
  assert.equal(storage.raw.get(ACCOUNT_LOCK_KEY), before);
});

test("the old door-only password has no recovery code and keeps working", async () => {
  const storage = memory();
  await setAccountLock("open-sesame", storage);
  assert.equal(recoveryCodePending(storage), false);
  assert.equal(await renewUnseenRecoveryCode("open-sesame", storage), null);
  markRecoveryCodeShown(storage);
  assert.equal(lockMode(storage), "door");
  assert.equal(await verifyAccountLock("open-sesame", storage), true);
  // upgrading it to encryption gives a code that is unseen until confirmed
  await openSecretItemsStore(DEVICE, storage).replaceAll([login]);
  await enableAccountEncryption({ deviceKey: DEVICE, password: "correct horse" }, storage);
  assert.equal(recoveryCodePending(storage), true);
});

test("unlocking while the code is unseen gives a new working code; the old one stops working", async () => {
  const { storage, recoveryCode, dataKey } = await encrypted();
  assert.equal(await renewUnseenRecoveryCode("wrong password", storage), null);
  assert.equal(await unlockEncrypted("correct horse", storage), dataKey);
  const fresh = await renewUnseenRecoveryCode("correct horse", storage);
  assert.match(fresh, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
  assert.notEqual(fresh, recoveryCode);
  assert.equal(recoveryCodePending(storage), true, "the new one also has to be confirmed");
  markRecoveryCodeShown(storage);
  assert.equal(await renewUnseenRecoveryCode("correct horse", storage), null, "nothing more to show once confirmed");
  assert.equal(await resetPasswordWithRecovery(recoveryCode, "fourth password 4", storage), null);
  assert.equal(await resetPasswordWithRecovery(fresh, "fourth password 4", storage), dataKey);
  assert.deepEqual(await openSecretItemsStore(dataKey, storage).list(), [login]);
});

test("an interrupted set-up is finished and then a new code is given", async () => {
  const { storage, dataKey } = await encrypted();
  // as if the app stopped mid-migration, before the code was ever on screen
  storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify({ ...lockRecord(storage), phase: "migrating" }));
  const key = await unlockEncrypted("correct horse", storage);
  await finishAccountMigration(DEVICE, key, storage);
  const fresh = await renewUnseenRecoveryCode("correct horse", storage);
  assert.ok(fresh);
  assert.equal(lockRecord(storage).phase, "ready");
  assert.equal(await resetPasswordWithRecovery(fresh, "another pass 1", storage), dataKey);
});

test("using the recovery code proves it was saved", async () => {
  const { storage, recoveryCode } = await encrypted();
  assert.equal(recoveryCodePending(storage), true);
  assert.ok(await resetPasswordWithRecovery(recoveryCode, "another pass 1", storage));
  assert.equal(recoveryCodePending(storage), false);
});

test("the pre-migration copy remembers the session that made it", async () => {
  const { storage } = await encrypted();
  const copy = JSON.parse(storage.raw.get(PREMIGRATION_KEY));
  assert.equal(copy.session, APP_SESSION);
  assert.deepEqual(copy.unlocks, []);
});

test("the copy is deleted after the data opened with K in three later sessions, counting each session once", async () => {
  const { storage, dataKey } = await encrypted();
  assert.equal(await notePremigrationUnlock(dataKey, storage), "same-session");
  assert.equal(await notePremigrationUnlock(dataKey, storage, APP_SESSION), "same-session");
  assert.equal(await notePremigrationUnlock(dataKey, storage, "s1"), "counted");
  assert.equal(await notePremigrationUnlock(dataKey, storage, "s1"), "already-counted");
  assert.equal(await notePremigrationUnlock(dataKey, storage, "s2"), "counted");
  assert.deepEqual(JSON.parse(storage.raw.get(PREMIGRATION_KEY)).unlocks, ["s1", "s2"]);
  assert.equal(hasPremigrationBackup(storage), true);
  assert.equal(await notePremigrationUnlock(dataKey, storage, "s3"), "deleted");
  assert.equal(hasPremigrationBackup(storage), false);
  assert.equal(await notePremigrationUnlock(dataKey, storage, "s4"), "none");
  assert.deepEqual(await openSecretItemsStore(dataKey, storage).list(), [login]);
});

test("a copy from before the counter existed counts every session as a later one", async () => {
  const { storage, dataKey } = await encrypted();
  const { session: _s, unlocks: _u, ...old } = JSON.parse(storage.raw.get(PREMIGRATION_KEY));
  void _s; void _u;
  storage.setItem(PREMIGRATION_KEY, JSON.stringify(old));
  assert.equal(await notePremigrationUnlock(dataKey, storage), "counted");
  assert.equal(await notePremigrationUnlock(dataKey, storage, "s2"), "counted");
  assert.equal(await notePremigrationUnlock(dataKey, storage, "s3"), "deleted");
});

test("the copy is never deleted when the data did not open with K", async () => {
  const { storage } = await encrypted();
  for (const session of ["s1", "s2", "s3", "s4"]) assert.equal(await notePremigrationUnlock("not-the-key", storage, session), "unreadable");
  assert.equal(hasPremigrationBackup(storage), true);
  assert.deepEqual(JSON.parse(storage.raw.get(PREMIGRATION_KEY)).unlocks, []);
});

test("the copy is never deleted while the migration is still pending", async () => {
  const { storage, dataKey } = await encrypted();
  storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify({ ...lockRecord(storage), phase: "migrating" }));
  // the items are still under the device key, as after a crash half way
  await openSecretItemsStore(DEVICE, storage).replaceAll([login]);
  for (const session of ["s1", "s2", "s3"]) assert.equal(await notePremigrationUnlock(dataKey, storage, session), "pending");
  assert.equal(hasPremigrationBackup(storage), true);
  await finishAccountMigration(DEVICE, dataKey, storage);
  for (const session of ["s1", "s2"]) assert.equal(await notePremigrationUnlock(dataKey, storage, session), "counted");
  assert.equal(await notePremigrationUnlock(dataKey, storage, "s3"), "deleted");
});

test("the copy is never deleted without an encrypting password, and a damaged copy is left alone", async () => {
  const { storage, dataKey } = await encrypted();
  const lock = storage.raw.get(ACCOUNT_LOCK_KEY);
  storage.removeItem(ACCOUNT_LOCK_KEY);
  assert.equal(await notePremigrationUnlock(dataKey, storage, "s1"), "pending");
  storage.setItem(ACCOUNT_LOCK_KEY, lock);
  storage.setItem(PREMIGRATION_KEY, "{broken");
  for (const session of ["s1", "s2", "s3"]) assert.equal(await notePremigrationUnlock(dataKey, storage, session), "unreadable");
  assert.equal(storage.raw.get(PREMIGRATION_KEY), "{broken");
  assert.ok(storage.raw.get(SECRET_ITEMS_KEY));
});
