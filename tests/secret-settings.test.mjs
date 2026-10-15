import assert from "node:assert/strict";
import test from "node:test";

import { createSecretSettings, secureSecretStore, SECRET_SETTINGS } from "../app/secret-settings.ts";
import { compressForUpload, readCustomKeys, saveCustomKeys } from "../app/image-compress.ts";

// D-057: the own TinyPNG keys and the 企业同步码 live in Windows Credential Manager; the page's storage keeps them only
// until the move is confirmed.
const KEY1 = "clipbox.tinify.key.v1";
const KEY2 = "clipbox.tinify.key2.v1";
const SYNC = "clipbox.shared-library-url";

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

function credentialManager(initial = {}, { readFails = false, writeFails = false, writeGarbles = false } = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get: async (name) => { if (readFails) throw new Error("unavailable"); return map.has(name) ? map.get(name) : null; },
    set: async (name, value) => { if (writeFails) throw new Error("unavailable"); map.set(name, writeGarbles ? `${value}?` : value); },
    remove: async (name) => { if (writeFails) throw new Error("unavailable"); map.delete(name); },
  };
}

test("only the Windows desktop app with the new commands uses Credential Manager", () => {
  const commands = { secretGet: async () => null, secretSet: async () => {}, secretDelete: async () => {} };
  assert.ok(secureSecretStore({ platform: "win32", ...commands }));
  assert.equal(secureSecretStore({ platform: "darwin", ...commands }), null);
  assert.equal(secureSecretStore({ platform: "win32" }), null);
  assert.equal(secureSecretStore(undefined), null);
  assert.deepEqual(Object.values(SECRET_SETTINGS), ["tinify-key-1", "tinify-key-2", "shared-library-url"]);
});

test("plain keys and the 同步码 move into Credential Manager on start and are still read the same way", async () => {
  const storage = memoryStorage({ [KEY1]: "one", [KEY2]: "two", [SYNC]: "CB-ABCD1234", "clipbox.tinify.usage.v1": "{}" });
  const secure = credentialManager();
  const settings = createSecretSettings(storage, secure);
  await settings.load();
  assert.deepEqual(Object.fromEntries(secure.map), { "tinify-key-1": "one", "tinify-key-2": "two", "shared-library-url": "CB-ABCD1234" });
  assert.deepEqual(storage.dump(), { "clipbox.tinify.usage.v1": "{}" });
  assert.deepEqual(readCustomKeys(settings.storage), ["one", "two"]);
  assert.equal(settings.storage.getItem(SYNC), "CB-ABCD1234");
  assert.equal(settings.storage.getItem("clipbox.tinify.usage.v1"), "{}");

  // The next start reads them back from Credential Manager.
  const again = createSecretSettings(storage, secure);
  await again.load();
  assert.deepEqual(readCustomKeys(again.storage), ["one", "two"]);
  assert.equal(again.storage.getItem(SYNC), "CB-ABCD1234");
});

test("a key is never lost: if Credential Manager refuses or gives back something else, the plain copy stays and is used", async () => {
  for (const options of [{ writeFails: true }, { writeGarbles: true }, { readFails: true }]) {
    const storage = memoryStorage({ [KEY1]: "one", [SYNC]: "CB-ABCD1234" });
    const settings = createSecretSettings(storage, credentialManager({}, options));
    await settings.load();
    assert.equal(storage.getItem(KEY1), "one", JSON.stringify(options));
    assert.equal(storage.getItem(SYNC), "CB-ABCD1234");
    assert.deepEqual(readCustomKeys(settings.storage), ["one", ""]);
    assert.equal(settings.storage.getItem(SYNC), "CB-ABCD1234");
  }
});

test("a plain copy is the newest value (older app, restored backup) and replaces what Credential Manager had", async () => {
  const storage = memoryStorage({ [KEY1]: "restored" });
  const secure = credentialManager({ "tinify-key-1": "older", "tinify-key-2": "kept" });
  const settings = createSecretSettings(storage, secure);
  await settings.load();
  assert.deepEqual(readCustomKeys(settings.storage), ["restored", "kept"]);
  assert.equal(secure.map.get("tinify-key-1"), "restored");
  assert.equal(storage.getItem(KEY1), null);
});

test("saving in 设置 writes next to the data first, then moves it; clearing removes it from Credential Manager too", async () => {
  const storage = memoryStorage();
  const secure = credentialManager();
  const settings = createSecretSettings(storage, secure);
  await settings.load();
  const october = new Date(2026, 9, 15);
  saveCustomKeys(settings.storage, [" fresh ", "second"], october);
  assert.deepEqual(readCustomKeys(settings.storage), ["fresh", "second"]);
  assert.equal(storage.getItem(KEY1), "fresh");
  await settings.settled();
  assert.equal(storage.getItem(KEY1), null);
  assert.equal(secure.map.get("tinify-key-1"), "fresh");

  // Typing the 同步码 letter by letter: Credential Manager ends with the last value.
  for (const value of ["C", "CB", "CB-1", "CB-12"]) settings.storage.setItem(SYNC, value);
  await settings.settled();
  assert.equal(secure.map.get("shared-library-url"), "CB-12");
  assert.equal(storage.getItem(SYNC), null);

  saveCustomKeys(settings.storage, ["", "second"], october);
  settings.storage.setItem(SYNC, "");
  await settings.settled();
  assert.deepEqual(readCustomKeys(settings.storage), ["", "second"]);
  assert.equal(secure.map.has("tinify-key-1"), false);
  assert.equal(secure.map.has("shared-library-url"), false);
  assert.equal(storage.getItem(KEY1), null);
  assert.equal(storage.getItem(SYNC), null);
});

test("a removal Credential Manager refused is finished on the next start, so the old key does not come back", async () => {
  const storage = memoryStorage();
  const secure = credentialManager({ "tinify-key-1": "old" });
  const settings = createSecretSettings(storage, { ...secure, remove: async () => { throw new Error("unavailable"); } });
  await settings.load();
  settings.storage.removeItem(KEY1);
  await settings.settled();
  assert.equal(storage.getItem(KEY1), "");
  assert.equal(readCustomKeys(settings.storage)[0], "");

  const next = createSecretSettings(storage, secure);
  await next.load();
  assert.equal(readCustomKeys(next.storage)[0], "");
  assert.equal(secure.map.has("tinify-key-1"), false);
  assert.equal(storage.getItem(KEY1), null);
});

test("browser trial and macOS: everything stays in the page's storage, as before", async () => {
  const storage = memoryStorage({ [KEY1]: "one" });
  const settings = createSecretSettings(storage, null);
  await settings.load();
  settings.storage.setItem(SYNC, "CB-ABCD1234");
  assert.deepEqual(storage.dump(), { [KEY1]: "one", [SYNC]: "CB-ABCD1234" });
  assert.deepEqual(settings.forBackup(), {});
});

test("the 完整备份 gets the moved values; compression sends the key from memory", async () => {
  const storage = memoryStorage({ [KEY1]: "one", [SYNC]: "CB-ABCD1234" });
  const settings = createSecretSettings(storage, credentialManager());
  await settings.load();
  assert.deepEqual(settings.forBackup(), { [KEY1]: "one", [SYNC]: "CB-ABCD1234" });

  const sent = [];
  const bridge = { compressImage: async (bytes, key) => { sent.push(key); return { ok: true, bytes: new Uint8Array(1) }; } };
  const png = new Blob([new Uint8Array(100)], { type: "image/png" });
  const result = await compressForUpload(png, { bridge, storage: settings.storage, now: new Date(2026, 9, 15) });
  assert.equal(result.failed, false);
  assert.deepEqual(sent, ["one"]);
});
