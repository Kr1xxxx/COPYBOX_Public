// Saving no longer runs PBKDF2 (310 000 rounds) every time: the derived key is kept in memory, and the 账号 stores
// keep their salt when they rewrite. What is stored must stay exactly as before: same fields, same salt and rounds,
// a new IV each write, readable by the old code (a fresh, uncached derivation).
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { clearDerivedKeys, derivePbkdf2AesKey } from "../app/key-cache.ts";
import { openSecretItemsStore, SECRET_ITEMS_KEY } from "../app/secret-items-store.ts";
import { openTotpStore, TOTP_STORAGE_KEY } from "../app/totp-store.ts";
import { readSiteIcons, SITE_ICONS_KEY, writeSiteIcons } from "../app/site-icon-store.ts";
import { pageHarness, seed } from "./helpers/page-harness.mjs";
import { memoryStorage } from "./helpers/memory-idb.mjs";

const subtle = webcrypto.subtle;
const fromBase64 = (text) => Uint8Array.from(Buffer.from(text, "base64"));

// Counts PBKDF2 derivations while it is installed.
function countDerivations() {
  const original = subtle.deriveKey;
  const spy = { count: 0, restore: () => { subtle.deriveKey = original; } };
  subtle.deriveKey = function (algorithm, ...rest) {
    if (algorithm?.name === "PBKDF2") spy.count += 1;
    return original.call(this, algorithm, ...rest);
  };
  return spy;
}

// How the code before this change derived and decrypted: no cache, nothing shared.
async function oldKey(secret, salt, iterations) {
  const material = await subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function oldDecrypt(envelope, secret, label) {
  const key = await oldKey(secret, fromBase64(envelope.salt), envelope.iterations);
  const options = { name: "AES-GCM", iv: fromBase64(envelope.iv), ...(label ? { additionalData: new TextEncoder().encode(label) } : {}) };
  return JSON.parse(new TextDecoder().decode(await subtle.decrypt(options, key, fromBase64(envelope.ciphertext))));
}
async function oldEncrypt(value, secret, label) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await oldKey(secret, salt, 310_000);
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(label) }, key, new TextEncoder().encode(JSON.stringify(value)));
  const b64 = (bytes) => Buffer.from(bytes).toString("base64");
  return { version: 1, salt: b64(salt), iv: b64(iv), ciphertext: b64(new Uint8Array(ciphertext)), iterations: 310_000 };
}

test("the same secret, salt and rounds give the same key without deriving again; anything different derives anew", async () => {
  clearDerivedKeys();
  const spy = countDerivations();
  try {
    const salt = Uint8Array.from({ length: 16 }, (_, index) => index);
    const first = await derivePbkdf2AesKey("device", salt, 1000);
    assert.equal(await derivePbkdf2AesKey("device", Uint8Array.from(salt), 1000), first);
    assert.equal(spy.count, 1);
    await derivePbkdf2AesKey("other", salt, 1000);
    await derivePbkdf2AesKey("device", Uint8Array.from({ length: 16 }, () => 7), 1000);
    await derivePbkdf2AesKey("device", salt, 1001);
    assert.equal(spy.count, 4);
    assert.equal(first.extractable, false);
    assert.deepEqual([...first.usages].sort(), ["decrypt", "encrypt"]);
  } finally {
    spy.restore();
  }
});

test("the cache keeps a bounded number of keys and drops the least recently used", async () => {
  clearDerivedKeys();
  const salt = (n) => Uint8Array.from({ length: 16 }, () => n);
  for (let n = 0; n < 16; n += 1) await derivePbkdf2AesKey("device", salt(n), 10);
  await derivePbkdf2AesKey("device", salt(0), 10); // used again: now the newest
  await derivePbkdf2AesKey("device", salt(16), 10); // pushes out salt(1)
  const spy = countDerivations();
  try {
    await derivePbkdf2AesKey("device", salt(0), 10);
    assert.equal(spy.count, 0);
    await derivePbkdf2AesKey("device", salt(1), 10);
    assert.equal(spy.count, 1);
  } finally {
    spy.restore();
  }
});

test("a failed derivation is not kept", async () => {
  clearDerivedKeys();
  const original = subtle.deriveKey;
  subtle.deriveKey = async () => { throw new Error("busy"); };
  const salt = new Uint8Array(16);
  try {
    await assert.rejects(derivePbkdf2AesKey("device", salt, 10), /busy/);
  } finally {
    subtle.deriveKey = original;
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(await derivePbkdf2AesKey("device", salt, 10));
});

test("a second vault save does not run PBKDF2 again; the envelope is unchanged in form and opens the old way", async () => {
  const h = await pageHarness();
  const data = await seed(h);
  clearDerivedKeys();
  const spy = countDerivations();
  let first, second;
  try {
    await h.c.storeVault(data);
    first = JSON.parse(h.storage.get("vault"));
    await h.c.storeVault(data);
    second = JSON.parse(h.storage.get("vault"));
    assert.equal(spy.count, 1, "the key is derived once for both saves");
  } finally {
    spy.restore();
  }
  assert.deepEqual(Object.keys(second).sort(), ["ciphertext", "iterations", "iv", "salt", "updatedAt", "version"]);
  assert.equal(second.version, 1);
  assert.equal(second.iterations, 310_000);
  assert.equal(second.salt, first.salt);
  assert.notEqual(second.iv, first.iv);
  const opened = await oldDecrypt(second, h.c.deviceKey);
  assert.deepEqual(opened.items.map((item) => item.secret), ["synthetic text"]);
});

test("a vault written by the old code still opens, and the page's round trip works", async () => {
  const h = await pageHarness();
  const data = await seed(h);
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await oldKey(h.c.deviceKey, salt, 310_000);
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  const b64 = (bytes) => Buffer.from(bytes).toString("base64");
  const legacy = { version: 1, salt: b64(salt), iv: b64(iv), ciphertext: b64(new Uint8Array(ciphertext)), iterations: 310_000, updatedAt: 1 };
  assert.deepEqual((await h.c.decryptVault(legacy, h.c.deviceKey)).items.map((item) => item.id), ["original"]);
  const roundTrip = await h.c.encryptVault(data, "a backup password");
  assert.deepEqual((await h.c.decryptVault(roundTrip, "a backup password")).items.map((item) => item.id), ["original"]);
  await assert.rejects(h.c.decryptVault(roundTrip, "wrong password"));
});

test("bytesToBase64 works in 32 KB pieces and gives the same text as before", async () => {
  const h = await pageHarness();
  for (const size of [0, 1, 0x8000, 0x8000 + 1, 200_003]) {
    const bytes = Uint8Array.from({ length: size }, (_, index) => (index * 131 + 7) % 256);
    assert.equal(h.c.bytesToBase64(bytes), Buffer.from(bytes).toString("base64"));
    assert.deepEqual(h.c.base64ToBytes(h.c.bytesToBase64(bytes)), bytes);
  }
});

test("账号 items: rewriting keeps the stored salt (new IV each time), derives once, and the old code can read it", async () => {
  clearDerivedKeys();
  const storage = memoryStorage();
  const store = openSecretItemsStore("device-key", storage);
  const spy = countDerivations();
  let first, second;
  try {
    await store.put({ id: "a", kind: "payment" });
    first = JSON.parse(storage.getItem(SECRET_ITEMS_KEY));
    await store.put({ id: "b", kind: "payment" });
    second = JSON.parse(storage.getItem(SECRET_ITEMS_KEY));
    assert.deepEqual((await store.list()).map((item) => item.id), ["a", "b"]);
    assert.equal(spy.count, 1);
  } finally {
    spy.restore();
  }
  assert.equal(second.salt, first.salt);
  assert.notEqual(second.iv, first.iv);
  assert.deepEqual(Object.keys(second).sort(), ["ciphertext", "iterations", "iv", "salt", "version"]);
  assert.deepEqual((await oldDecrypt(second, "device-key", "clipbox-vault-items:items")).items.map((item) => item.id), ["a", "b"]);
});

test("账号 items written by the old code are read, and a rewrite keeps their salt", async () => {
  const storage = memoryStorage({ [SECRET_ITEMS_KEY]: JSON.stringify(await oldEncrypt({ items: [{ id: "old" }] }, "device-key", "clipbox-vault-items:items")) });
  const before = JSON.parse(storage.getItem(SECRET_ITEMS_KEY));
  await openSecretItemsStore("device-key", storage).put({ id: "new" });
  const after = JSON.parse(storage.getItem(SECRET_ITEMS_KEY));
  assert.equal(after.salt, before.salt);
  assert.deepEqual((await oldDecrypt(after, "device-key", "clipbox-vault-items:items")).items.map((item) => item.id), ["old", "new"]);
});

test("验证码 accounts: same salt on rewrite, one derivation, old code can read it", async () => {
  clearDerivedKeys();
  const storage = memoryStorage();
  const store = openTotpStore("device-key", storage);
  const spy = countDerivations();
  let first, second;
  try {
    await store.add({ id: "1", secret: "JBSWY3DPEHPK3PXP", issuer: "A", name: "a" });
    first = JSON.parse(storage.getItem(TOTP_STORAGE_KEY));
    await store.add({ id: "2", secret: "JBSWY3DPEHPK3PXQ", issuer: "B", name: "b" });
    second = JSON.parse(storage.getItem(TOTP_STORAGE_KEY));
    assert.equal(spy.count, 1);
  } finally {
    spy.restore();
  }
  assert.equal(second.salt, first.salt);
  assert.notEqual(second.iv, first.iv);
  assert.deepEqual((await oldDecrypt(second, "device-key", "clipbox-totp:accounts")).accounts.map((account) => account.id), ["1", "2"]);
});

test("site icons: same salt on rewrite, one derivation, old code can read it", async () => {
  clearDerivedKeys();
  const storage = memoryStorage();
  const spy = countDerivations();
  let first, second;
  try {
    await writeSiteIcons("device-key", { "a.example": { data: "", at: 1 } }, storage);
    first = JSON.parse(storage.getItem(SITE_ICONS_KEY));
    await writeSiteIcons("device-key", { "a.example": { data: "", at: 1 }, "b.example": { data: "", at: 2 } }, storage);
    second = JSON.parse(storage.getItem(SITE_ICONS_KEY));
    assert.deepEqual(Object.keys(await readSiteIcons("device-key", storage)).sort(), ["a.example", "b.example"]);
    assert.equal(spy.count, 1);
  } finally {
    spy.restore();
  }
  assert.equal(second.salt, first.salt);
  assert.notEqual(second.iv, first.iv);
  assert.deepEqual(Object.keys((await oldDecrypt(second, "device-key", "clipbox-site-icons:icons")).icons).sort(), ["a.example", "b.example"]);
});
