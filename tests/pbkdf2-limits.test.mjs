// A made-up backup file or a tampered record can name any PBKDF2 count. Counts outside what Copyboxx writes are refused
// before any rounds run, so such a file gets a plain error instead of freezing the app.
import assert from "node:assert/strict";
import test from "node:test";
import { assertIterationCap, isSaneIterationCount, MAX_ITERATIONS, MIN_ITERATIONS } from "../app/pbkdf2-limits.ts";
import { derivePbkdf2AesKey } from "../app/key-cache.ts";
import { parseTransferFile, sealTransfer } from "../app/data-transfer.ts";
import { ACCOUNT_LOCK_KEY, verifyAccountLock } from "../app/account-lock.ts";

test("every count Copyboxx writes is in range; absurd ones are not", () => {
  for (const count of [210_000, 310_000, 600_000]) assert.ok(isSaneIterationCount(count), String(count));
  for (const count of [0, 1, MIN_ITERATIONS - 1, MAX_ITERATIONS + 1, 2 ** 31, 1.5, "600000", null, Infinity, NaN]) {
    assert.equal(isSaneIterationCount(count), false, String(count));
  }
  assert.throws(() => assertIterationCap(2 ** 31), /已损坏/);
  assert.doesNotThrow(() => assertIterationCap(MAX_ITERATIONS));
});

test("a stored record with a huge count is refused before PBKDF2 runs", async () => {
  const started = Date.now();
  await assert.rejects(derivePbkdf2AesKey("device-key", new Uint8Array(16), 2 ** 31), /已损坏/);
  assert.ok(Date.now() - started < 1000);
});

test("a full backup naming 2^31 rounds (or a weak count) is refused when the file is picked", async () => {
  const file = await sealTransfer({ localStorage: {}, indexedDB: {} }, "long-enough-pass");
  assert.doesNotThrow(() => parseTransferFile(JSON.stringify(file)));
  for (const iterations of [2 ** 31, 10_000_000, 1, 99_999]) {
    assert.throws(() => parseTransferFile(JSON.stringify({ ...file, iterations })), /已损坏/, String(iterations));
  }
});

test("a full backup with a malformed salt, IV or ciphertext is refused", async () => {
  const file = await sealTransfer({ localStorage: {}, indexedDB: {} }, "long-enough-pass");
  for (const broken of [{ salt: "" }, { salt: "AAAA" }, { iv: "AAAAAAAA" }, { iv: "not base64!" }, { ciphertext: "" }]) {
    assert.throws(() => parseTransferFile(JSON.stringify({ ...file, ...broken })), /已损坏/, JSON.stringify(broken));
  }
});

test("an account-lock record with an absurd count does not hang the unlock", async () => {
  const map = new Map([[ACCOUNT_LOCK_KEY, JSON.stringify({ version: 1, salt: "AAAAAAAAAAAAAAAAAAAAAA==", hash: "AA==", iterations: 2 ** 31 })]]);
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
  const started = Date.now();
  await assert.rejects(verifyAccountLock("whatever", storage));
  assert.ok(Date.now() - started < 1000);
});
