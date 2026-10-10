import assert from "node:assert/strict";
import test from "node:test";
import { buildEnglishBlock, isValidIban, isValidSwift, normalizePaymentFields, paymentHint, validatePayment } from "../app/payment-core.ts";
import { openSecretItemsStore, SECRET_ITEMS_KEY } from "../app/secret-items-store.ts";

test("IBAN check digits: known good and one wrong digit", () => {
  assert.equal(isValidIban("GB82 WEST 1234 5698 7654 32"), true);
  assert.equal(isValidIban("DE89370400440532013000"), true);
  assert.equal(isValidIban("GB82 WEST 1234 5698 7654 33"), false);
  assert.equal(isValidIban("12345"), false);
});

test("SWIFT is 8 or 11 letters and digits", () => {
  assert.equal(isValidSwift("DEUTDEFF"), true);
  assert.equal(isValidSwift("deut deff 500"), true);
  assert.equal(isValidSwift("DEUTDEF"), false);
  assert.equal(isValidSwift("DEUTDEFF50"), false);
});

test("normalising strips spaces and upper-cases what should be", () => {
  const out = normalizePaymentFields("bank", { holder: "  Comely  ", account: "gb82 west 1234 5698 7654 32", swift: "deut deff", currency: "usd" });
  assert.deepEqual([out.holder, out.account, out.swift, out.currency], ["Comely", "GB82WEST12345698765432", "DEUTDEFF", "USD"]);
});

test("validation reports missing fields, a bad IBAN, a bad SWIFT and a bad e-mail in plain Chinese", () => {
  const errors = validatePayment("bank", "", { account: "GB82WEST12345698765433", swift: "XX" });
  assert.match(errors.name, /名称/);
  assert.match(errors.holder, /收款人户名/);
  assert.match(errors.bank, /银行名称/);
  assert.match(errors.account, /IBAN/);
  assert.match(errors.swift, /SWIFT/);
  assert.deepEqual(validatePayment("paypal", "PP", { email: "nope" }), { email: "邮箱格式不对" });
  assert.deepEqual(validatePayment("paypal", "PP", { email: "pay@example.com" }), {});
  assert.deepEqual(validatePayment("bank", "招行", { holder: "A", bank: "B", account: "6222021234567890", swift: "CMBCCNBS" }), {});
});

test("English block lists the filled fields in order; hint shows the last 4", () => {
  const item = { kind: "bank", fields: { holder: "Comely Beauty Ltd", bank: "HSBC", account: "GB82WEST12345698765432", swift: "DEUTDEFF", bankAddress: "", currency: "USD" } };
  assert.equal(buildEnglishBlock(item), "Beneficiary Name: Comely Beauty Ltd\nBank Name: HSBC\nAccount No. / IBAN: GB82WEST12345698765432\nSWIFT / BIC: DEUTDEFF\nCurrency: USD");
  assert.equal(paymentHint(item), "银行电汇 · 尾号 5432");
  assert.equal(paymentHint({ kind: "paypal", fields: { email: "a@b.co" } }), "PayPal · a@b.co");
});

test("store: encrypted at rest, put replaces by id, wrong key fails, quick saves both survive, limit", async () => {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
  const store = openSecretItemsStore("device-key", storage, 2);
  const item = (id, name) => ({ id, type: "payment", kind: "paypal", name, fields: { email: "pay@example.com" }, createdAt: 1, updatedAt: 1 });
  await Promise.all([store.put(item("a", "A")), store.put(item("b", "B"))]);
  assert.ok(!map.get(SECRET_ITEMS_KEY).includes("pay@example.com"));
  await assert.rejects(store.put(item("c", "C")), /最多/);
  assert.equal((await store.put({ ...item("a", "A2"), updatedAt: 2 })).find((entry) => entry.id === "a").name, "A2");
  await assert.rejects(openSecretItemsStore("other", storage).list(), /无法读取/);
  assert.deepEqual((await store.remove("a")).map((entry) => entry.id), ["b"]);
});

test("the old 验证码 key is never touched by the new store", async () => {
  const map = new Map([["clipbox.totp.v1", "legacy-bytes"]]);
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
  await openSecretItemsStore("k", storage).put({ id: "a", type: "payment", kind: "paypal", name: "A", fields: { email: "a@b.co" }, createdAt: 1, updatedAt: 1 });
  assert.equal(map.get("clipbox.totp.v1"), "legacy-bytes");
});
