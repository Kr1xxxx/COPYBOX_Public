import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPRESS_LIMIT_MESSAGE,
  COMPRESS_MONTHLY_LIMIT,
  TINIFY_DEFAULT_KEY,
  TINIFY_KEY_STORAGE,
  TINIFY_USAGE_STORAGE,
  compressForUpload,
  readCompressUsage,
  readTinifyKey,
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

test("the built-in key is used unless one is set in 设置", () => {
  assert.equal(readTinifyKey(memoryStorage()), TINIFY_DEFAULT_KEY);
  assert.equal(readTinifyKey(memoryStorage({ [TINIFY_KEY_STORAGE]: " mine " })), "mine");
});

test("a compressed picture replaces the original and counts once", async () => {
  const storage = memoryStorage();
  let sentKey = "";
  const bridge = { compressImage: async (bytes, key) => { sentKey = key; return { ok: true, bytes: bytes.slice(0, 100) }; } };
  const result = await compressForUpload(png(1000), { bridge, storage, now: october });
  assert.equal(result.blob.size, 100);
  assert.equal(result.blob.type, "image/png");
  assert.equal(result.saved, 900);
  assert.equal(sentKey, TINIFY_DEFAULT_KEY);
  assert.equal(readCompressUsage(storage, october), 1);
});

test("when compression fails the original is kept, said so, and not counted", async () => {
  const storage = memoryStorage();
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
  const storage = memoryStorage({ [TINIFY_USAGE_STORAGE]: JSON.stringify({ month: "2026-10", count: COMPRESS_MONTHLY_LIMIT }) });
  let called = false;
  const bridge = { compressImage: async () => { called = true; return { ok: false, reason: "x" }; } };
  await assert.rejects(compressForUpload(png(10), { bridge, storage, now: october }), { message: COMPRESS_LIMIT_MESSAGE });
  assert.equal(called, false);
  // the next month it works again
  assert.equal((await compressForUpload(png(10), { bridge, storage, now: new Date(2026, 10, 2) })).failed, true);
});

test("GIFs, and a browser without the desktop bridge, are stored as they are without counting", async () => {
  const storage = memoryStorage();
  const gif = new Blob([new Uint8Array(10)], { type: "image/gif" });
  const bridge = { compressImage: async () => { throw new Error("must not be called"); } };
  assert.equal((await compressForUpload(gif, { bridge, storage, now: october })).blob, gif);
  const file = png(10);
  assert.equal((await compressForUpload(file, { bridge: {}, storage, now: october })).blob, file);
  assert.equal(readCompressUsage(storage, october), 0);
});

test("a result that is not smaller keeps the original but still counts", async () => {
  const storage = memoryStorage();
  const original = png(50);
  const result = await compressForUpload(original, { bridge: { compressImage: async (bytes) => ({ ok: true, bytes: new Uint8Array(bytes.length + 5) }) }, storage, now: october });
  assert.equal(result.blob, original);
  assert.equal(readCompressUsage(storage, october), 1);
});
