import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPRESS_LIMIT_MESSAGE,
  COMPRESS_MONTHLY_LIMIT,
  COMPRESS_NO_KEY_NOTICE,
  TINIFY_KEY2_STORAGE,
  TINIFY_KEY_STORAGE,
  TINIFY_USAGE_STORAGE,
  compressForUpload,
  customKeyStatus,
  saveCustomKeys,
  readCompressUsage,
} from "../app/image-compress.ts";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}
const png = (size) => new Blob([new Uint8Array(size)], { type: "image/png" });
const october = new Date(2026, 9, 11);

test("the count belongs to a calendar month and starts again in the next one", () => {
  const storage = memoryStorage({ [TINIFY_USAGE_STORAGE]: JSON.stringify({ month: "2026-10", count: 42 }) });
  assert.equal(readCompressUsage(storage, october), 42);
  assert.equal(readCompressUsage(storage, new Date(2026, 10, 1)), 0);
  assert.equal(readCompressUsage(memoryStorage({ [TINIFY_USAGE_STORAGE]: "garbage" }), october), 0);
});

const withKey = (initial = {}) => memoryStorage({ [TINIFY_KEY_STORAGE]: "mine", ...initial });

test("no key is built in: without one in 设置 nothing is sent or counted, and the original is kept with a hint", async () => {
  const storage = memoryStorage();
  const bridge = { compressImage: async () => { throw new Error("must not be called"); } };
  const original = png(100);
  const result = await compressForUpload(original, { bridge, storage, now: october });
  assert.equal(result.blob, original);
  assert.equal(result.notice, COMPRESS_NO_KEY_NOTICE);
  assert.equal(readCompressUsage(storage, october), 0);
});

test("the source has no TinyPNG key in it", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/image-compress.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /["'][A-Za-z0-9]{32}["']/);
});

test("a compressed picture replaces the original and counts once", async () => {
  const storage = withKey();
  let sentKey = "";
  const bridge = { compressImage: async (bytes, key) => { sentKey = key; return { ok: true, bytes: bytes.slice(0, 100) }; } };
  const result = await compressForUpload(png(1000), { bridge, storage, now: october });
  assert.equal(result.blob.size, 100);
  assert.equal(result.blob.type, "image/png");
  assert.equal(result.saved, 900);
  assert.equal(sentKey, "mine");
  assert.equal(readCompressUsage(storage, october), 1);
});

test("when compression fails the original is kept, said so, and not counted", async () => {
  const storage = withKey();
  const original = png(500);
  for (const [outcome, text] of [[async () => ({ ok: false, reason: "network" }), "没有连上压缩服务"], [async () => { throw new Error("boom"); }, "压缩服务暂时不可用"]]) {
    const result = await compressForUpload(original, { bridge: { compressImage: outcome }, storage, now: october });
    assert.equal(result.blob, original);
    assert.equal(result.failed, true);
    assert.match(result.notice, new RegExp(`${text}，已保存原图`));
  }
  assert.equal(readCompressUsage(storage, october), 0);
});

test("at 100 a month the upload is refused and nothing is sent", async () => {
  const storage = withKey({ [TINIFY_USAGE_STORAGE]: JSON.stringify({ month: "2026-10", count: COMPRESS_MONTHLY_LIMIT }) });
  let called = false;
  const bridge = { compressImage: async () => { called = true; return { ok: false, reason: "x" }; } };
  await assert.rejects(compressForUpload(png(10), { bridge, storage, now: october }), { message: COMPRESS_LIMIT_MESSAGE });
  assert.equal(called, false);
  // the next month it works again
  assert.equal((await compressForUpload(png(10), { bridge, storage, now: new Date(2026, 10, 2) })).failed, true);
});

test("GIFs, and a browser without the desktop bridge, are stored as they are without counting", async () => {
  const storage = withKey();
  const gif = new Blob([new Uint8Array(10)], { type: "image/gif" });
  const bridge = { compressImage: async () => { throw new Error("must not be called"); } };
  assert.equal((await compressForUpload(gif, { bridge, storage, now: october })).blob, gif);
  const file = png(10);
  assert.equal((await compressForUpload(file, { bridge: {}, storage, now: october })).blob, file);
  assert.equal(readCompressUsage(storage, october), 0);
});

test("a result that is not smaller keeps the original but still counts", async () => {
  const storage = withKey();
  const original = png(50);
  const result = await compressForUpload(original, { bridge: { compressImage: async (bytes) => ({ ok: true, bytes: new Uint8Array(bytes.length + 5) }) }, storage, now: october });
  assert.equal(result.blob, original);
  assert.equal(readCompressUsage(storage, october), 1);
});

const okBridge = (sent, fail = {}) => ({
  compressImage: async (bytes, key) => { sent.push(key); return fail[key] ? { ok: false, reason: fail[key] } : { ok: true, bytes: bytes.slice(0, 10) }; },
});

test("a key set in 设置 is the only key used", async () => {
  const storage = memoryStorage({ [TINIFY_KEY_STORAGE]: "mine" });
  const sent = [];
  await compressForUpload(png(100), { bridge: okBridge(sent, { mine: "limit" }), storage, now: october });
  assert.deepEqual(sent, ["mine"]);
});

test("with two own keys the first is used, and once it is refused the second takes over for the month", async () => {
  const storage = memoryStorage({ [TINIFY_KEY_STORAGE]: "one", [TINIFY_KEY2_STORAGE]: "two" });
  const sent = [];
  await compressForUpload(png(100), { bridge: okBridge(sent), storage, now: october });
  await compressForUpload(png(100), { bridge: okBridge(sent), storage, now: october });
  assert.deepEqual(sent, ["one", "one"]);
  assert.deepEqual(customKeyStatus(storage, october), { active: 0, refused: [] });
  sent.length = 0;
  const result = await compressForUpload(png(100), { bridge: okBridge(sent, { one: "limit" }), storage, now: october });
  assert.equal(result.failed, false);
  assert.deepEqual(sent, ["one", "two"]);
  assert.deepEqual(customKeyStatus(storage, october), { active: 1, refused: [0] });
  sent.length = 0;
  await compressForUpload(png(100), { bridge: okBridge(sent), storage, now: october });
  assert.deepEqual(sent, ["two"]);
  // a new month starts with the first key again
  sent.length = 0;
  await compressForUpload(png(100), { bridge: okBridge(sent), storage, now: new Date(2026, 10, 2) });
  assert.deepEqual(sent, ["one"]);
});

test("own keys never fall back to the built-in ones, and a network error does not switch keys", async () => {
  const storage = memoryStorage({ [TINIFY_KEY_STORAGE]: "one", [TINIFY_KEY2_STORAGE]: "two" });
  const sent = [];
  const refused = await compressForUpload(png(100), { bridge: okBridge(sent, { one: "key", two: "limit" }), storage, now: october });
  assert.equal(refused.failed, true);
  assert.deepEqual(sent, ["one", "two"]);
  sent.length = 0;
  const offline = memoryStorage({ [TINIFY_KEY_STORAGE]: "one", [TINIFY_KEY2_STORAGE]: "two" });
  await compressForUpload(png(100), { bridge: okBridge(sent, { one: "network" }), storage: offline, now: october });
  assert.deepEqual(sent, ["one"]);
  assert.deepEqual(customKeyStatus(offline, october), { active: 0, refused: [] });
});

test("only a second key set still works, and saving a new key clears its refusal", async () => {
  const storage = memoryStorage({ [TINIFY_KEY2_STORAGE]: "two" });
  const sent = [];
  await compressForUpload(png(100), { bridge: okBridge(sent), storage, now: october });
  assert.deepEqual(sent, ["two"]);
  saveCustomKeys(storage, ["one", "two"], october);
  sent.length = 0;
  await compressForUpload(png(100), { bridge: okBridge(sent, { one: "limit" }), storage, now: october });
  assert.deepEqual(customKeyStatus(storage, october).refused, [0]);
  saveCustomKeys(storage, [" fresh ", "two"], october);
  assert.equal(storage.getItem(TINIFY_KEY_STORAGE), "fresh");
  assert.deepEqual(customKeyStatus(storage, october), { active: 0, refused: [] });
  saveCustomKeys(storage, ["", ""], october);
  assert.equal(storage.getItem(TINIFY_KEY_STORAGE), null);
  assert.deepEqual(customKeyStatus(storage, october), { active: null, refused: [] });
});

const builtInBridge = (sent, count, fail = {}) => ({
  compressBuiltInCount: async () => count,
  compressImage: async (bytes, key) => { sent.push(key); return fail[key] ? { ok: false, reason: fail[key] } : { ok: true, bytes: bytes.slice(0, 10) }; },
});

test("keys built into the installer are named builtin:N, take turns, and a refused one is skipped for the month", async () => {
  const storage = memoryStorage();
  const sent = [];
  for (let i = 0; i < 3; i++) await compressForUpload(png(100), { bridge: builtInBridge(sent, 2), storage, now: october });
  assert.deepEqual(sent, ["builtin:0", "builtin:1", "builtin:0"]);
  sent.length = 0;
  await compressForUpload(png(100), { bridge: builtInBridge(sent, 2, { "builtin:1": "limit" }), storage, now: october });
  await compressForUpload(png(100), { bridge: builtInBridge(sent, 2), storage, now: october });
  assert.deepEqual(sent, ["builtin:1", "builtin:0", "builtin:0"]);
  assert.equal(readCompressUsage(storage, october), 5);
});

test("own keys come before the built-in ones", async () => {
  const sent = [];
  await compressForUpload(png(100), { bridge: builtInBridge(sent, 2), storage: withKey(), now: october });
  assert.deepEqual(sent, ["mine"]);
});

// D-055: with a 企业同步码 and no own key, the shell is asked for the company proxy.
test("a 企业同步码 sends the picture through the company proxy; an own key still comes first", async () => {
  const sent = [];
  const bridge = { compressImage: async (bytes, key) => { sent.push(key); return { ok: true, bytes: bytes.slice(0, 10) }; }, compressBuiltInCount: async () => 2 };
  const storage = memoryStorage({ "clipbox.shared-library-url": " cb-test1234 " });
  const result = await compressForUpload(png(1000), { bridge, storage, now: october });
  assert.deepEqual(sent, ["proxy:CB-TEST1234"]);
  assert.match(result.notice, /^已通过企业同步码压缩/);
  assert.equal(readCompressUsage(storage, october), 1);
  storage.setItem(TINIFY_KEY_STORAGE, "mine");
  await compressForUpload(png(1000), { bridge, storage, now: october });
  assert.deepEqual(sent, ["proxy:CB-TEST1234", "mine"]);
});

test("a full address instead of a 同步码 does not use the proxy; a refused code keeps the original and says why", async () => {
  const storage = memoryStorage({ "clipbox.shared-library-url": "https://company.example/library.json" });
  const bridge = { compressImage: async () => { throw new Error("must not be called"); } };
  assert.equal((await compressForUpload(png(100), { bridge, storage, now: october })).notice, COMPRESS_NO_KEY_NOTICE);
  const refused = memoryStorage({ "clipbox.shared-library-url": "CB-NOPE0000" });
  const original = png(100);
  const result = await compressForUpload(original, { bridge: { compressImage: async () => ({ ok: false, reason: "code" }) }, storage: refused, now: october });
  assert.equal(result.blob, original);
  assert.equal(result.failed, true);
  assert.equal(result.notice, "企业同步码不能用来压缩，已保存原图");
  assert.equal(readCompressUsage(refused, october), 0);
});
