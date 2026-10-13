import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_LOCK_KEY, changeEncryptedPassword, encryptedPhase, lockMode, renewRecoveryCode, resetPasswordWithRecovery, unlockEncrypted, writeEncryptedLock } from "../app/account-lock.ts";
import { PREMIGRATION_KEY, deletePremigrationBackup, disableAccountEncryption, enableAccountEncryption, finishAccountMigration, hasPremigrationBackup } from "../app/account-encryption.ts";
import { SECRET_ITEMS_KEY, openSecretItemsStore } from "../app/secret-items-store.ts";
import { TOTP_STORAGE_KEY, openTotpStore } from "../app/totp-store.ts";
import { SITE_ICONS_KEY, readSiteIcons, writeSiteIcons } from "../app/site-icon-store.ts";

const DEVICE = "device-key-for-tests";
const memory = (failOn) => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { if (failOn?.(k, v, m)) throw new Error("disk full"); m.set(k, v); }, removeItem: (k) => void m.delete(k), raw: m };
};
const login = { id: "l1", type: "login", name: "后台", username: "me@x.test", password: "S3cret-pass", url: "https://x.test", updatedAt: 1 };
const totp = { id: "t1", issuer: "X", name: "me", secret: "MFRGGZDFMZTWQ2LK", digits: 6, period: 30, algorithm: "SHA1" };

async function seeded(storage = memory()) {
  await openSecretItemsStore(DEVICE, storage).replaceAll([login]);
  await openTotpStore(DEVICE, storage).replaceAll([totp]);
  return storage;
}

test("encrypting moves the data to a key only the password or recovery code can open, and keeps a backup", async () => {
  const storage = await seeded();
  const before = storage.raw.get(SECRET_ITEMS_KEY);
  const { recoveryCode, dataKey } = await enableAccountEncryption({ deviceKey: DEVICE, password: "correct horse", email: "me@x.test" }, storage);
  assert.equal(lockMode(storage), "encrypted");
  assert.equal(encryptedPhase(storage), "ready");
  assert.match(recoveryCode, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
  await assert.rejects(() => openSecretItemsStore(DEVICE, storage).list());
  assert.deepEqual(await openSecretItemsStore(dataKey, storage).list(), [login]);
  assert.deepEqual(await openTotpStore(dataKey, storage).list(), [totp]);
  const record = storage.raw.get(ACCOUNT_LOCK_KEY);
  assert.ok(!record.includes("correct horse") && !record.includes(dataKey));
  assert.equal(await unlockEncrypted("correct horse", storage), dataKey);
  assert.equal(await unlockEncrypted("wrong password", storage), null);
  // the pre-migration backup is the old ciphertext, still readable with the device key until deleted
  assert.equal(hasPremigrationBackup(storage), true);
  assert.equal(JSON.parse(storage.raw.get(PREMIGRATION_KEY)).data[SECRET_ITEMS_KEY], before);
  deletePremigrationBackup(storage);
  assert.equal(hasPremigrationBackup(storage), false);
});

test("a forgotten password never loses data: the recovery code opens it and sets a new password; a new code replaces the old", async () => {
  const storage = await seeded();
  const { recoveryCode, dataKey } = await enableAccountEncryption({ deviceKey: DEVICE, password: "correct horse" }, storage);
  assert.equal(await resetPasswordWithRecovery("abcd-wrong-code", "another pass 1", storage), null);
  assert.equal(await resetPasswordWithRecovery(recoveryCode.toLowerCase().replaceAll("-", " "), "another pass 1", storage), dataKey);
  assert.equal(await unlockEncrypted("correct horse", storage), null);
  assert.equal(await unlockEncrypted("another pass 1", storage), dataKey);
  assert.equal(await changeEncryptedPassword("nope", "third password 3", storage), null);
  assert.equal(await changeEncryptedPassword("another pass 1", "third password 3", storage), dataKey);
  const fresh = await renewRecoveryCode("third password 3", storage);
  assert.notEqual(fresh, recoveryCode);
  assert.equal(await resetPasswordWithRecovery(recoveryCode, "fourth password 4", storage), null);
  assert.equal(await resetPasswordWithRecovery(fresh, "fourth password 4", storage), dataKey);
  await assert.rejects(() => resetPasswordWithRecovery(fresh, "short", storage), /至少/);
});

test("a short password is refused before anything is touched", async () => {
  const storage = await seeded();
  const raw = storage.raw.get(SECRET_ITEMS_KEY);
  await assert.rejects(() => enableAccountEncryption({ deviceKey: DEVICE, password: "short" }, storage), /至少/);
  assert.equal(storage.raw.get(SECRET_ITEMS_KEY), raw);
  assert.equal(lockMode(storage), "none");
});

test("if encrypting fails half way, the data, the old password record and the stores are put back exactly", async () => {
  const storage = memory();
  await seeded(storage);
  storage.setItem(ACCOUNT_LOCK_KEY, JSON.stringify({ version: 1, salt: "AA==", hash: "AA==", iterations: 1 }));
  const rawItems = storage.raw.get(SECRET_ITEMS_KEY), rawTotp = storage.raw.get(TOTP_STORAGE_KEY), rawLock = storage.raw.get(ACCOUNT_LOCK_KEY);
  let totpWrites = 0;
  const failing = { ...storage, setItem: (k, v) => { if (k === TOTP_STORAGE_KEY && (totpWrites += 1) === 1) throw new Error("disk full"); storage.setItem(k, v); } };
  await assert.rejects(() => enableAccountEncryption({ deviceKey: DEVICE, password: "correct horse" }, failing), /数据和密码都没有改动/);
  assert.equal(storage.raw.get(SECRET_ITEMS_KEY), rawItems);
  assert.equal(storage.raw.get(TOTP_STORAGE_KEY), rawTotp);
  assert.equal(storage.raw.get(ACCOUNT_LOCK_KEY), rawLock);
  assert.equal(hasPremigrationBackup(storage), false);
  assert.deepEqual(await openSecretItemsStore(DEVICE, storage).list(), [login]);
});

test("an interrupted encryption is finished at the next unlock without losing anything", async () => {
  const storage = await seeded();
  // as if the app stopped after the items were moved but before the 验证码 were
  await writeEncryptedLock({ dataKey: "K-for-test", password: "correct horse", recoveryCode: "AAAA-BBBB-CCCC-DDDD-EEEE", phase: "migrating" }, storage);
  await openSecretItemsStore("K-for-test", storage).replaceAll([login]);
  assert.equal(encryptedPhase(storage), "migrating");
  await finishAccountMigration(DEVICE, "K-for-test", storage);
  assert.equal(encryptedPhase(storage), "ready");
  assert.deepEqual(await openSecretItemsStore("K-for-test", storage).list(), [login]);
  assert.deepEqual(await openTotpStore("K-for-test", storage).list(), [totp]);
});

test("turning the encryption off puts the data back under the device key (password needed)", async () => {
  const storage = await seeded();
  await enableAccountEncryption({ deviceKey: DEVICE, password: "correct horse" }, storage);
  await assert.rejects(() => disableAccountEncryption({ deviceKey: DEVICE, password: "wrong" }, storage), /不对/);
  assert.equal(lockMode(storage), "encrypted");
  await disableAccountEncryption({ deviceKey: DEVICE, password: "correct horse" }, storage);
  assert.equal(lockMode(storage), "none");
  assert.deepEqual(await openSecretItemsStore(DEVICE, storage).list(), [login]);
  assert.deepEqual(await openTotpStore(DEVICE, storage).list(), [totp]);
});

test("every persisted checkpoint while disabling encryption can be reopened without losing current accounts", async () => {
  const storage = await seeded();
  const { dataKey } = await enableAccountEncryption({ deviceKey: DEVICE, password: "correct horse" }, storage);
  const updated = { ...login, password: "changed-after-encryption" };
  const icons = { "x.test": { data: "data:image/png;base64,AA==", at: 1 } };
  await openSecretItemsStore(dataKey, storage).replaceAll([updated]);
  await writeSiteIcons(dataKey, icons, storage);
  deletePremigrationBackup(storage); // recovery must not depend on an old or deleted upgrade backup
  const checkpoints = [];
  const capture = (key) => { if ([ACCOUNT_LOCK_KEY, SECRET_ITEMS_KEY, TOTP_STORAGE_KEY, SITE_ICONS_KEY].includes(key)) checkpoints.push(new Map(storage.raw)); };
  const observed = {
    ...storage,
    setItem: (key, value) => { storage.setItem(key, value); capture(key); },
    removeItem: (key) => { storage.removeItem(key); capture(key); },
  };
  await disableAccountEncryption({ deviceKey: DEVICE, password: "correct horse" }, observed);
  assert.ok(checkpoints.length >= 4);
  for (const snapshot of checkpoints) {
    const reopened = memory();
    for (const [key, value] of snapshot) reopened.setItem(key, value);
    let key = DEVICE;
    if (lockMode(reopened) === "encrypted") {
      key = await unlockEncrypted("correct horse", reopened);
      assert.ok(key);
      await finishAccountMigration(DEVICE, key, reopened);
    }
    assert.deepEqual(await openSecretItemsStore(key, reopened).list(), [updated]);
    assert.deepEqual(await openTotpStore(key, reopened).list(), [totp]);
    assert.deepEqual(await readSiteIcons(key, reopened), icons);
  }
});

test("failure removing the password record rolls disabling encryption back", async () => {
  const storage = await seeded();
  const { dataKey } = await enableAccountEncryption({ deviceKey: DEVICE, password: "correct horse" }, storage);
  const before = new Map(storage.raw);
  const failing = { ...storage, removeItem: (key) => { if (key === ACCOUNT_LOCK_KEY) throw new Error("disk full"); storage.removeItem(key); } };
  await assert.rejects(() => disableAccountEncryption({ deviceKey: DEVICE, password: "correct horse" }, failing));
  assert.deepEqual(storage.raw, before);
  assert.deepEqual(await openSecretItemsStore(dataKey, storage).list(), [login]);
});
