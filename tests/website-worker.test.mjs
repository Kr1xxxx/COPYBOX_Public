import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import worker, { cacheControlFor, candidateKeys, contentTypeFor } from "../tools/website/worker.mjs";

const files = {
  "index.html": "<title>home</title>",
  "404.html": "<title>找不到这个页面</title>",
  "preview/index.html": "<title>preview</title>",
  "preview/app-win.html": "<title>app</title>",
  "preview/assets/static/x.js": "console.log(1);",
  "download/Clipboxx-Setup.exe": "MZ fake installer",
  "download/latest.json": '{"version":"1.65.0"}',
};

function fakeEnv(entries = files) {
  const store = new Map(
    Object.entries(entries).map(([key, text]) => {
      const bytes = Buffer.from(text);
      return [key, { bytes, metadata: { type: contentTypeFor(key), sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length } }];
    }),
  );
  const reads = [];
  return {
    reads,
    FILES: {
      async getWithMetadata(key, opts) {
        reads.push(key);
        const file = store.get(key);
        if (!file) return { value: null, metadata: null };
        const value = opts?.type === "stream" ? new Blob([file.bytes]).stream() : file.bytes.toString();
        return { value, metadata: file.metadata };
      },
    },
  };
}

function get(path, init = {}, env = fakeEnv()) {
  return worker.fetch(new Request(`https://copyboxx.com${path}`, init), env);
}

test("worker: lookup keys, content types and cache rules", () => {
  assert.deepEqual(candidateKeys("/"), [{ key: "index.html" }]);
  assert.deepEqual(candidateKeys("/preview/"), [{ key: "preview/index.html" }]);
  assert.deepEqual(candidateKeys("/preview"), [{ key: "preview" }, { key: "preview/index.html", redirect: "/preview/" }]);
  assert.deepEqual(candidateKeys("/preview/app-win.html"), [{ key: "preview/app-win.html" }]);
  assert.equal(candidateKeys("/%2e%2e/x"), null);
  assert.equal(candidateKeys("/..%5c"), null);
  assert.equal(candidateKeys("/%E0%A4%A"), null);
  assert.equal(contentTypeFor("a/b.html"), "text/html; charset=utf-8");
  assert.equal(contentTypeFor("x.exe"), "application/x-msdownload");
  assert.equal(contentTypeFor("x.woff2"), "font/woff2");
  assert.equal(contentTypeFor("README"), "application/octet-stream");
  assert.equal(cacheControlFor("preview/index.html"), "no-cache");
  assert.equal(cacheControlFor("download/latest.json"), "no-cache");
  assert.equal(cacheControlFor("preview/assets/static/x.js"), "public, max-age=31536000, immutable");
  assert.equal(cacheControlFor("preview/seed.js"), "public, max-age=3600");
});

test("worker: pages are served, a folder without slash redirects, html files keep their path", async () => {
  const home = await get("/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /^text\/html/);
  assert.equal(home.headers.get("cache-control"), "no-cache");
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await home.text(), files["index.html"]);

  const preview = await get("/preview/");
  assert.equal(preview.status, 200);
  assert.equal(await preview.text(), files["preview/index.html"]);

  const bare = await get("/preview");
  assert.equal(bare.status, 308);
  assert.equal(bare.headers.get("location"), "/preview/");

  const app = await get("/preview/app-win.html");
  assert.equal(app.status, 200);
  assert.equal(await app.text(), files["preview/app-win.html"]);
});

test("worker: hashed assets are cached for good, the installer downloads, latest.json revalidates", async () => {
  const chunk = await get("/preview/assets/static/x.js");
  assert.equal(chunk.status, 200);
  assert.equal(chunk.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.match(chunk.headers.get("content-type"), /^text\/javascript/);

  const exe = await get("/download/Clipboxx-Setup.exe");
  assert.equal(exe.status, 200);
  assert.equal(exe.headers.get("content-type"), "application/x-msdownload");
  assert.equal(exe.headers.get("content-disposition"), 'attachment; filename="Clipboxx-Setup.exe"');
  assert.equal(exe.headers.get("content-length"), String(Buffer.byteLength(files["download/Clipboxx-Setup.exe"])));
  assert.equal(await exe.text(), files["download/Clipboxx-Setup.exe"]);

  const latest = await get("/download/latest.json");
  assert.equal(latest.headers.get("cache-control"), "no-cache");
  assert.match(latest.headers.get("content-type"), /^application\/json/);
});

test("worker: unknown paths get the 404 page, or plain text when it is missing", async () => {
  const missing = await get("/nothing");
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), files["404.html"]);
  assert.equal(missing.headers.get("etag"), null);

  const bare = await get("/nothing", {}, fakeEnv({ "index.html": "x" }));
  assert.equal(bare.status, 404);
  assert.match(await bare.text(), /404/);

  // The URL parser already folds "/%2e%2e/x" into "/x"; a backslash survives it and is refused before any lookup.
  assert.equal((await get("/%2e%2e/x")).status, 404);
  for (const path of ["/..%5c", "/..%5cindex.html"]) {
    const env = fakeEnv();
    const response = await get(path, {}, env);
    assert.equal(response.status, 404, path);
    assert.deepEqual(env.reads, ["404.html"], path);
  }
});

test("worker: matching ETag gives 304, HEAD has no body, other methods are refused", async () => {
  const first = await get("/");
  const etag = first.headers.get("etag");
  assert.match(etag, /^"[0-9a-f]{64}"$/);
  const again = await get("/", { headers: { "If-None-Match": etag } });
  assert.equal(again.status, 304);
  assert.equal(await again.text(), "");
  assert.equal((await get("/", { headers: { "If-None-Match": '"other"' } })).status, 200);

  const head = await get("/download/Clipboxx-Setup.exe", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-type"), "application/x-msdownload");
  assert.equal(await head.text(), "");

  const post = await get("/", { method: "POST", body: "x" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
});
