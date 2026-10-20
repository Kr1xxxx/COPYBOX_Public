import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_LOCK_KEY, checkNewPassword, isAccountLockSet, removeAccountLock, setAccountLock, verifyAccountLock } from "../app/account-lock.ts";

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), raw: m }; };

test("no password by default; setting one stores a salted hash, not the password", async () => {
  const storage = memory();
  assert.equal(isAccountLockSet(storage), false);
  await setAccountLock("open-sesame", storage);
  assert.equal(isAccountLockSet(storage), true);
  assert.ok(!storage.raw.get(ACCOUNT_LOCK_KEY).includes("open-sesame"));
  const other = memory();
  await setAccountLock("open-sesame", other);
  assert.notEqual(storage.raw.get(ACCOUNT_LOCK_KEY), other.raw.get(ACCOUNT_LOCK_KEY));
});

test("only the right password opens; removing the password turns the check off", async () => {
  const storage = memory();
  await setAccountLock("open-sesame", storage);
  assert.equal(await verifyAccountLock("open-sesame", storage), true);
  assert.equal(await verifyAccountLock("open-sesamE", storage), false);
  assert.equal(await verifyAccountLock("", storage), false);
  removeAccountLock(storage);
  assert.equal(isAccountLockSet(storage), false);
});

test("a short password is refused and a damaged record never opens the page", async () => {
  const storage = memory();
  assert.match(checkNewPassword("abc"), /至少/);
  await assert.rejects(() => setAccountLock("abc", storage));
  assert.equal(isAccountLockSet(storage), false);
  storage.setItem(ACCOUNT_LOCK_KEY, "{broken");
  assert.equal(isAccountLockSet(storage), true);
  assert.equal(await verifyAccountLock("anything", storage), false);
});

test("maskEmail shows enough of an address to recognise it", async () => {
  const { maskEmail } = await import("../app/account-lock.ts");
  assert.equal(maskEmail("me@example.com"), "m***@example.com");
  assert.equal(maskEmail("nope"), "");
});
