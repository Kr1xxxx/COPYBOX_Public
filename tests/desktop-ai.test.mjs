import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { createAiStore } = require("../desktop/ai.cjs");

function harness(fetchImpl) {
  const files = new Map();
  const fs = {
    existsSync: (file) => files.has(file),
    readFileSync: (file) => files.get(file),
    writeFileSync: (file, text) => files.set(file, text),
    rmSync: (file) => files.delete(file),
  };
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (text) => Buffer.from(`enc:${text}`),
    decryptString: (buffer) => buffer.toString().replace(/^enc:/, ""),
  };
  return { files, store: createAiStore({ filePath: "ai.json", fs, safeStorage, fetchImpl }) };
}

test("the key is stored encrypted and never written in plain text", () => {
  const { files, store } = harness();
  assert.deepEqual(store.save({ baseUrl: "https://api.example.com/v1", key: "sk-secret" }), { hasKey: true, origin: "https://api.example.com" });
  assert.doesNotMatch(files.get("ai.json"), /sk-secret/);
  assert.deepEqual(store.status(), { hasKey: true, origin: "https://api.example.com" });
});

test("an empty key keeps the saved one for the same server only", () => {
  const { store } = harness();
  store.save({ baseUrl: "https://a.example.com/v1", key: "k1" });
  assert.equal(store.save({ baseUrl: "https://a.example.com/v2", key: "" }).hasKey, true);
  assert.throws(() => store.save({ baseUrl: "https://b.example.com/v1", key: "" }), /API Key/);
  assert.equal(store.status().origin, "https://a.example.com");
});

test("plain http is only allowed for this computer", () => {
  const { store } = harness();
  assert.throws(() => store.save({ baseUrl: "http://api.example.com", key: "k" }), /https/);
  assert.equal(store.save({ baseUrl: "http://localhost:11434/v1", key: "k" }).hasKey, true);
});

test("requests carry the saved key but only to the saved server", async () => {
  const calls = [];
  const { store } = harness(async (url, init) => { calls.push({ url: String(url), init }); return { ok: true, status: 200, text: async () => "{}" }; });
  store.save({ baseUrl: "https://api.example.com/v1", key: "sk-1" });
  const reply = await store.request({ url: "https://api.example.com/v1/chat/completions", body: { a: 1 } });
  assert.equal(reply.status, 200);
  assert.equal(calls[0].init.headers.authorization, "Bearer sk-1");
  await assert.rejects(store.request({ url: "https://evil.example.net/v1/chat/completions", body: {} }), /不匹配/);
  assert.equal(calls.length, 1);
});

test("clearing removes the key", () => {
  const { store } = harness();
  store.save({ baseUrl: "https://api.example.com/v1", key: "k" });
  assert.deepEqual(store.clear(), { hasKey: false, origin: "" });
});

test("the model list is fetched with GET and no body", async () => {
  const calls = [];
  const { store } = harness(async (url, init) => { calls.push(init); return { ok: true, status: 200, text: async () => "{}" }; });
  store.save({ baseUrl: "https://api.example.com/v1", key: "sk-1" });
  await store.request({ url: "https://api.example.com/v1/models", method: "GET" });
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].body, undefined);
  assert.equal(calls[0].headers.authorization, "Bearer sk-1");
  assert.equal(calls[0].headers["content-type"], undefined);
});
