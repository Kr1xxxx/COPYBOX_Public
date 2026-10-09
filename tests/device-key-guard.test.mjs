import assert from "node:assert/strict";
import test from "node:test";
import { deviceKeyProtectionAvailable, openGuardedVault } from "../app/device-key-guard.ts";

// Stand-in crypto: an "envelope" is JSON { key, data }; it only opens with the same key.
const encrypt = async (data, key) => ({ key, data });
const decrypt = async (envelope, key) => {
  if (envelope.key !== key) throw new Error("wrong key");
  return envelope.data;
};

function setup({ vault, legacy, record, failSetAt } = {}) {
  const store = new Map();
  if (vault !== undefined) store.set("vault", JSON.stringify(vault));
  if (legacy !== undefined) store.set("legacy", legacy);
  let saved = record ?? null;
  let sets = 0;
  let counter = 0;
  const bridge = {
    deviceKeyAvailable: async () => true,
    deviceKeyGet: async () => saved && { ...saved },
    deviceKeySet: async (next) => {
      sets += 1;
      if (failSetAt === sets) throw new Error("injected failure");
      saved = { ...next };
      return true;
    },
  };
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const deps = { bridge, storage, vaultKey: "vault", legacyKeyKey: "legacy", decrypt, encrypt, createKey: () => `new-key-${++counter}`, createEmpty: () => ({ items: [] }) };
  return { store, deps, saved: () => saved };
}

test("first start: the key goes to the protected store and is never kept in page storage", async () => {
  const s = setup();
  const opened = await openGuardedVault(s.deps);
  assert.deepEqual(opened.data, { items: [] });
  assert.deepEqual(s.saved(), { key: opened.key });
  assert.equal(s.store.has("legacy"), false);
  assert.equal(JSON.parse(s.store.get("vault")).key, opened.key);
});

test("an older vault is moved to a fresh protected key and the old key is removed", async () => {
  const s = setup({ vault: { key: "old", data: { n: 1 } }, legacy: "old" });
  const opened = await openGuardedVault(s.deps);
  assert.deepEqual(opened.data, { n: 1 });
  assert.notEqual(opened.key, "old");
  assert.deepEqual(s.saved(), { key: opened.key });
  assert.equal(s.store.has("legacy"), false);
  assert.equal(JSON.parse(s.store.get("vault")).key, opened.key, "the stored vault no longer opens with the old key");
  // And the next start is a plain open with no writes to the page storage.
  const again = await openGuardedVault(s.deps);
  assert.deepEqual(again, { data: { n: 1 }, key: opened.key });
});

test("a failure saving the new key leaves the old vault and old key untouched", async () => {
  const s = setup({ vault: { key: "old", data: { n: 1 } }, legacy: "old", failSetAt: 1 });
  await assert.rejects(openGuardedVault(s.deps), /injected/);
  assert.equal(s.store.get("legacy"), "old");
  assert.equal(JSON.parse(s.store.get("vault")).key, "old");
  const retry = await openGuardedVault({ ...s.deps }); // the failure was one-off
  assert.deepEqual(retry.data, { n: 1 });
});

test("a crash after the new key was saved but before the vault was rewritten recovers", async () => {
  // State after step 2: protected store has {new, previous: old}; vault still uses the old key.
  const s = setup({ vault: { key: "old", data: { n: 2 } }, legacy: "old", record: { key: "half-new", previous: "old" } });
  const opened = await openGuardedVault(s.deps);
  assert.equal(opened.key, "half-new");
  assert.deepEqual(opened.data, { n: 2 });
  assert.deepEqual(s.saved(), { key: "half-new" });
  assert.equal(s.store.has("legacy"), false);
});

test("a crash after the vault was rewritten but before cleanup finishes recovers", async () => {
  const s = setup({ vault: { key: "k2", data: { n: 3 } }, legacy: "old", record: { key: "k2", previous: "old" } });
  const opened = await openGuardedVault(s.deps);
  assert.deepEqual(opened, { data: { n: 3 }, key: "k2" });
  assert.deepEqual(s.saved(), { key: "k2" });
  assert.equal(s.store.has("legacy"), false);
});

test("nothing can open the vault: error, and nothing is changed or replaced", async () => {
  const s = setup({ vault: { key: "lost", data: { n: 4 } }, record: { key: "other" } });
  await assert.rejects(openGuardedVault(s.deps), /could not be decrypted/);
  assert.equal(JSON.parse(s.store.get("vault")).key, "lost");
  assert.deepEqual(s.saved(), { key: "other" });
  const noKey = setup({ vault: { key: "lost", data: {} } });
  await assert.rejects(noKey.deps.bridge.deviceKeyGet().then(() => openGuardedVault(noKey.deps)), /key is missing/);
  assert.equal(noKey.store.has("vault"), true);
});

test("an unreadable protected key does not start an empty vault; the old key can still recover", async () => {
  const s = setup({ vault: { key: "old", data: { n: 5 } }, legacy: "old" });
  s.deps.bridge.deviceKeyGet = (() => { let first = true; return async () => { if (first) { first = false; throw new Error("cannot decrypt"); } return s.saved(); }; })();
  const opened = await openGuardedVault(s.deps);
  assert.deepEqual(opened.data, { n: 5 });
  const bare = setup({ vault: { key: "x", data: {} } });
  bare.deps.bridge.deviceKeyGet = async () => { throw new Error("cannot decrypt"); };
  await assert.rejects(openGuardedVault(bare.deps), /key is missing/);
  assert.equal(bare.store.has("vault"), true);
});

test("protection is only used when the desktop shell offers all three calls and says yes", async () => {
  assert.equal(await deviceKeyProtectionAvailable(undefined), false);
  assert.equal(await deviceKeyProtectionAvailable({}), false);
  const base = { deviceKeyGet: async () => null, deviceKeySet: async () => true };
  assert.equal(await deviceKeyProtectionAvailable({ ...base, deviceKeyAvailable: async () => false }), false);
  assert.equal(await deviceKeyProtectionAvailable({ ...base, deviceKeyAvailable: async () => { throw new Error("x"); } }), false);
  assert.equal(await deviceKeyProtectionAvailable({ ...base, deviceKeyAvailable: async () => true }), true);
});
