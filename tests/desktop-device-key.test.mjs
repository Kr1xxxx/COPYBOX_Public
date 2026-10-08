import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { createDeviceKeyStore } = require("../desktop/device-key.cjs");

function harness({ platform = "win32", available = true } = {}) {
  const files = new Map();
  const fs = {
    existsSync: (file) => files.has(file),
    readFileSync: (file) => files.get(file),
    writeFileSync: (file, text) => files.set(file, text),
    renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); },
  };
  const safeStorage = {
    isEncryptionAvailable: () => available,
    encryptString: (text) => Buffer.from(`enc:${text}`),
    decryptString: (buffer) => {
      const text = buffer.toString();
      if (!text.startsWith("enc:")) throw new Error("cannot decrypt");
      return text.slice(4);
    },
  };
  return { files, store: createDeviceKeyStore({ filePath: "device-key.json", fs, safeStorage, platform }) };
}

test("the device key is stored encrypted, never in plain text, and reads back", () => {
  const { files, store } = harness();
  assert.equal(store.get(), null);
  assert.equal(store.set({ key: "secret-key-1" }), true);
  assert.doesNotMatch(files.get("device-key.json"), /secret-key-1/);
  assert.deepEqual(store.get(), { key: "secret-key-1" });
  store.set({ key: "secret-key-2", previous: "secret-key-1" });
  assert.deepEqual(store.get(), { key: "secret-key-2", previous: "secret-key-1" });
  assert.equal(files.has("device-key.json.tmp"), false);
});

test("protection is only offered on Windows with working system encryption", () => {
  assert.equal(harness().store.available(), true);
  assert.equal(harness({ platform: "darwin" }).store.available(), false);
  assert.equal(harness({ platform: "linux" }).store.available(), false);
  assert.equal(harness({ available: false }).store.available(), false);
  assert.throws(() => harness({ available: false }).store.set({ key: "k" }), /不支持/);
});

test("a key file that cannot be read is an error, never mistaken for 'no key yet'", () => {
  const { files, store } = harness();
  files.set("device-key.json", JSON.stringify({ version: 1, data: Buffer.from("garbage").toString("base64") }));
  assert.throws(() => store.get());
  files.set("device-key.json", "not json");
  assert.throws(() => store.get());
  files.set("device-key.json", JSON.stringify({ version: 9, data: "x" }));
  assert.throws(() => store.get(), /无法识别/);
});

test("only well-formed records are accepted", () => {
  const { store } = harness();
  for (const bad of [null, {}, { key: "" }, { key: 5 }, { key: "k", previous: "" }, { key: "x".repeat(201) }]) assert.throws(() => store.set(bad), /格式/);
  assert.equal(store.get(), null);
});
