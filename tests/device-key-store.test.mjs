// D-053: on Windows the device key moves into Credential Manager. The copy next to the data is only removed after the
// protected store gave the same key back; any failure keeps it, so the vault always opens.
import assert from "node:assert/strict";
import test from "node:test";
import { DEVICE_KEY, deviceKeyCandidates, settleDeviceKey, withDeviceKey } from "../app/device-key-store.ts";

const K1 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const K2 = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";

function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, String(v)), removeItem: (k) => void map.delete(k), has: (k) => map.has(k) };
}
function vaultOf(initial = null, { failGet = false, failSet = false, lie = false } = {}) {
  let value = initial;
  return {
    get calls() { return value; },
    get: async () => { if (failGet) throw new Error("unavailable"); return value; },
    set: async (key) => { if (failSet) throw new Error("unavailable"); value = lie ? K2 : key; },
  };
}

test("browser and Mac: nothing moves, the key stays next to the data", async () => {
  const local = storage({ [DEVICE_KEY]: K1 });
  assert.deepEqual(await deviceKeyCandidates(local, null), [K1]);
  assert.equal(await settleDeviceKey(K1, local, null), "kept");
  assert.ok(local.has(DEVICE_KEY));
});

test("Windows, first start after the update: the key moves and the copy next to the data goes", async () => {
  const local = storage({ [DEVICE_KEY]: K1 });
  const secure = vaultOf(null);
  assert.deepEqual(await deviceKeyCandidates(local, secure), [K1]);
  assert.equal(await settleDeviceKey(K1, local, secure), "moved");
  assert.equal(await secure.get(), K1);
  assert.equal(local.has(DEVICE_KEY), false);
  assert.deepEqual(await deviceKeyCandidates(local, secure), [K1]);
});

test("Windows: if Credential Manager refuses or gives back something else, the copy next to the data is kept", async () => {
  for (const options of [{ failSet: true }, { failGet: true }, { lie: true }]) {
    const local = storage({ [DEVICE_KEY]: K1 });
    assert.equal(await settleDeviceKey(K1, local, vaultOf(null, options)), "kept", JSON.stringify(options));
    assert.equal(local.getItem(DEVICE_KEY), K1);
  }
});

test("Windows: an unreadable Credential Manager falls back to the copy next to the data", async () => {
  const local = storage({ [DEVICE_KEY]: K1 });
  assert.deepEqual(await deviceKeyCandidates(local, vaultOf(K2, { failGet: true })), [K1]);
  assert.deepEqual(await deviceKeyCandidates(storage(), vaultOf(K2, { failGet: true })), []);
});

test("Windows: after a 完整备份 restore both keys are tried, protected first; the one that opened the vault is kept", async () => {
  const local = storage({ [DEVICE_KEY]: K2 });
  const secure = vaultOf(K1);
  assert.deepEqual(await deviceKeyCandidates(local, secure), [K1, K2]);
  // K2 (from the backup) opened the vault: it replaces the old protected key and the copy goes.
  assert.equal(await settleDeviceKey(K2, local, secure), "moved");
  assert.equal(await secure.get(), K2);
  assert.equal(local.has(DEVICE_KEY), false);
});

test("Windows: a leftover copy that did not open the vault is not touched", async () => {
  const local = storage({ [DEVICE_KEY]: K2 });
  assert.equal(await settleDeviceKey(K1, local, vaultOf(K1)), "moved");
  assert.equal(local.getItem(DEVICE_KEY), K2);
});

test("a 完整备份 carries the protected key; one that already has a key is left as it is", async () => {
  const payload = { localStorage: { "clipbox.vault.v1": "V" }, indexedDB: {} };
  assert.deepEqual((await withDeviceKey(payload, vaultOf(K1))).localStorage, { "clipbox.vault.v1": "V", [DEVICE_KEY]: K1 });
  assert.equal(await withDeviceKey(payload, null), payload);
  const carrying = { localStorage: { [DEVICE_KEY]: K2 }, indexedDB: {} };
  assert.equal(await withDeviceKey(carrying, vaultOf(K1)), carrying);
});
