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
