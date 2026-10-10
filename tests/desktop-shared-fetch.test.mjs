import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { fetchSharedText, parseSharedUrl } = require("../desktop/shared-fetch.cjs");

const ok = (text) => async () => ({ ok: true, status: 200, text: async () => text });

test("only plain http(s) addresses without a login are accepted", () => {
  assert.equal(parseSharedUrl(" https://example.com/lib.json ").href, "https://example.com/lib.json");
  for (const bad of ["", "ftp://example.com/x", "file:///etc/passwd", "javascript:alert(1)", "https://user:pw@example.com/x", "not a url"]) {
    assert.throws(() => parseSharedUrl(bad), /地址/, bad);
  }
});

test("the file is fetched with a plain GET that sends no cookies", async () => {
  let seen;
  const text = await fetchSharedText("https://example.com/lib.json", { fetchImpl: async (url, init) => { seen = { url: String(url), init }; return { ok: true, status: 200, text: async () => "{}" }; } });
  assert.equal(text, "{}");
  assert.equal(seen.init.method, "GET");
  assert.equal(seen.init.credentials, "omit");
  assert.equal(seen.init.headers.authorization, undefined);
});

test("a bad answer, a huge file, a timeout and a dead address each give a plain message", async () => {
  await assert.rejects(fetchSharedText("https://example.com/x", { fetchImpl: async () => ({ ok: false, status: 404, text: async () => "" }) }), /404/);
  await assert.rejects(fetchSharedText("https://example.com/x", { fetchImpl: ok("x".repeat(20)), maxBytes: 10 }), /太大/);
  await assert.rejects(fetchSharedText("https://example.com/x", { timeoutMs: 10, fetchImpl: (url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) }), /超时/);
  await assert.rejects(fetchSharedText("https://example.com/x", { fetchImpl: async () => { throw new Error("ECONNREFUSED"); } }), /无法连接/);
});
