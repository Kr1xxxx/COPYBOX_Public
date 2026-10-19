import assert from "node:assert/strict";
import test from "node:test";
import { openSecretItemsStore } from "../app/secret-items-store.ts";
import { openTotpStore } from "../app/totp-store.ts";
import { clearSampleEntries, previewClearSamples, restoreSampleEntries, sampleVaultData } from "../app/vault-samples.ts";

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }; };
const KEY = "device-key-test";

function userData() {
  const base = { createdAt: 1, updatedAt: 1 };
  const items = [
    { id: "u-login", type: "login", name: "我的店铺", url: "https://shop.test", username: "me@shop.test", password: "pw-1", note: "", ...base },
    { id: "u-api", type: "apikey", name: "我的接口", service: "X", key: "k-1234567890", secret: "", endpoint: "", expires: "", ...base },
    { id: "u-pay", type: "payment", kind: "paypal", name: "【范例】我自己起的名字", fields: { email: "a@b.test" }, ...base },
    { id: "u-rec", type: "recovery", name: "恢复码", site: "x.test", codes: ["a", "b"], note: "", ...base },
  ];
  const totp = [{ id: "u-totp", issuer: "Mine", name: "【范例】别误删", secret: "MFRGGZDFMZTWQ2LKNNWG23TP", digits: 6, period: 30, algorithm: "SHA1", createdAt: 1 }];
  return { items, totp };
}

test("clearing examples leaves every user entry exactly as it was, even ones named like examples", async () => {
  const storage = memory();
  const mine = userData();
  const samples = sampleVaultData(5);
  await openSecretItemsStore(KEY, storage).replaceAll([...mine.items, ...samples.items]);
  await openTotpStore(KEY, storage).replaceAll([...mine.totp, ...samples.totp]);
  assert.deepEqual((await previewClearSamples(KEY, storage)).sort(), ["Example 【范例】验证码", "【范例】Example 后台", "【范例】接口密钥", "【范例】恢复码", "【范例】美元电汇"].sort());
  const result = await clearSampleEntries(KEY, storage);
  assert.equal(result.removed, 5);
  assert.deepEqual(await openSecretItemsStore(KEY, storage).list(), mine.items);
  assert.deepEqual(await openTotpStore(KEY, storage).list(), mine.totp);
  // A second clear has nothing left to take and changes nothing.
  assert.equal((await clearSampleEntries(KEY, storage)).removed, 0);
  assert.deepEqual(await openSecretItemsStore(KEY, storage).list(), mine.items);
});

test("with only user data (no examples) a clear removes nothing at all", async () => {
  const storage = memory();
  const mine = userData();
  await openSecretItemsStore(KEY, storage).replaceAll(mine.items);
  await openTotpStore(KEY, storage).replaceAll(mine.totp);
  assert.deepEqual(await previewClearSamples(KEY, storage), []);
  assert.equal((await clearSampleEntries(KEY, storage)).removed, 0);
  assert.deepEqual(await openSecretItemsStore(KEY, storage).list(), mine.items);
  assert.deepEqual(await openTotpStore(KEY, storage).list(), mine.totp);
});

test("restoring adds only the missing examples and leaves user entries alone", async () => {
  const storage = memory();
  const mine = userData();
  await openSecretItemsStore(KEY, storage).replaceAll(mine.items);
  await openTotpStore(KEY, storage).replaceAll(mine.totp);
  assert.equal((await restoreSampleEntries(KEY, storage)).added, 5);
  assert.equal((await restoreSampleEntries(KEY, storage)).added, 0);
  const items = await openSecretItemsStore(KEY, storage).list();
  assert.deepEqual(items.filter((item) => !item.id.startsWith("sample-")), mine.items);
  assert.equal(items.length, mine.items.length + 4);
});

test("an entry saved while the examples are being put in is not lost (stores opened separately share one line)", async () => {
  const storage = memory();
  const mine = userData();
  const restoring = restoreSampleEntries(KEY, storage);
  // A second store object, as the 验证码 and 账号 panels open their own.
  const saving = [openTotpStore(KEY, storage).add(mine.totp[0]), openSecretItemsStore(KEY, storage).put(mine.items[0])];
  await Promise.all([restoring, ...saving]);
  assert.deepEqual((await openTotpStore(KEY, storage).list()).map((entry) => entry.id).sort(), ["sample-totp", "u-totp"]);
  assert.deepEqual((await openSecretItemsStore(KEY, storage).list()).map((item) => item.id).sort(), ["sample-apikey", "sample-login", "sample-payment", "sample-recovery", "u-login"]);
});

test("a clear running at the same moment as a save keeps the saved entry", async () => {
  const storage = memory();
  const mine = userData();
  const samples = sampleVaultData(5);
  await openSecretItemsStore(KEY, storage).replaceAll(samples.items);
  await openTotpStore(KEY, storage).replaceAll(samples.totp);
  await Promise.all([clearSampleEntries(KEY, storage), openTotpStore(KEY, storage).add(mine.totp[0]), openSecretItemsStore(KEY, storage).put(mine.items[0])]);
  assert.deepEqual((await openTotpStore(KEY, storage).list()).map((entry) => entry.id), ["u-totp"]);
  assert.deepEqual((await openSecretItemsStore(KEY, storage).list()).map((item) => item.id), ["u-login"]);
});

// Windows has no category for API 密钥 / 恢复码 (D-038): those 范例 are left out there, and an install that already
// got them (up to 2.05) loses the untouched ones only; edited ones and the user's own entries of those kinds stay.
const WINDOWS_HIDDEN = ["other", "apikey", "recovery"];

test("the examples of kinds a platform has no category for are left out when restoring", async () => {
  assert.deepEqual(sampleVaultData(1, WINDOWS_HIDDEN).items.map((item) => item.type).sort(), ["login", "payment"]);
  const storage = memory();
  assert.equal((await restoreSampleEntries(KEY, storage, WINDOWS_HIDDEN)).added, 3);
  assert.deepEqual((await openSecretItemsStore(KEY, storage).list()).map((item) => item.id).sort(), ["sample-login", "sample-payment"]);
  assert.deepEqual((await openTotpStore(KEY, storage).list()).map((entry) => entry.id), ["sample-totp"]);
});

test("a clear limited to the hidden kinds removes only those untouched examples", async () => {
  const storage = memory();
  const mine = userData();
  const samples = sampleVaultData(5);
  const editedRecovery = { ...samples.items.find((item) => item.type === "recovery"), updatedAt: 9 };
  await openSecretItemsStore(KEY, storage).replaceAll([...mine.items, ...samples.items.filter((item) => item.type !== "recovery"), editedRecovery]);
  await openTotpStore(KEY, storage).replaceAll([...mine.totp, ...samples.totp]);
  const result = await clearSampleEntries(KEY, storage, WINDOWS_HIDDEN);
  assert.equal(result.removed, 1);
  assert.equal(result.keptEdited, 1);
  const ids = (await openSecretItemsStore(KEY, storage).list()).map((item) => item.id).sort();
  assert.deepEqual(ids, ["sample-login", "sample-payment", "sample-recovery", "u-api", "u-login", "u-pay", "u-rec"]);
  assert.deepEqual((await openTotpStore(KEY, storage).list()).map((entry) => entry.id).sort(), ["sample-totp", "u-totp"]);
  // Nothing of those kinds left to take: the store is not rewritten.
  assert.equal((await clearSampleEntries(KEY, storage, WINDOWS_HIDDEN)).removed, 0);
});
