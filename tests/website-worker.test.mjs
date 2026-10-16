import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import worker, {
  cacheControlFor,
  candidateKeys,
  contentTypeFor,
  httpsRedirect,
  syncKeyFor,
} from "../tools/website/worker.mjs";

const files = {
  "index.html": "<title>home</title>",
  "404.html": "<title>找不到这个页面</title>",
  "download/index.html": "<title>download</title>",
  "download/Copyboxx-Setup.exe": "MZ fake installer",
  "download/latest.json": '{"version":"1.65.0"}',
  "favicon.ico": "fake icon",
  "images/app-win-light.png": "fake screenshot",
  "assets/site.0123abcd.css": "body{}",
  "site.webmanifest": '{"name":"Copyboxx"}',
  "robots.txt": "User-agent: *",
  "sitemap.xml": "<urlset/>",
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
  assert.deepEqual(candidateKeys("/download/"), [{ key: "download/index.html" }]);
  assert.deepEqual(candidateKeys("/download"), [{ key: "download" }, { key: "download/index.html", redirect: "/download/" }]);
  assert.deepEqual(candidateKeys("/help/index.html"), [{ key: "help/index.html" }]);
  assert.equal(candidateKeys("/%2e%2e/x"), null);
  assert.equal(candidateKeys("/..%5c"), null);
  assert.equal(candidateKeys("/%E0%A4%A"), null);
  assert.equal(contentTypeFor("a/b.html"), "text/html; charset=utf-8");
  assert.equal(contentTypeFor("x.exe"), "application/x-msdownload");
  assert.equal(contentTypeFor("download/private-x/Copyboxx-macOS-arm64.zip"), "application/zip");
  assert.equal(contentTypeFor("x.woff2"), "font/woff2");
  assert.equal(contentTypeFor("README"), "application/octet-stream");
  assert.equal(cacheControlFor("download/index.html"), "no-cache");
  assert.equal(cacheControlFor("download/latest.json"), "no-cache");
  assert.equal(cacheControlFor("download/Copyboxx-Setup.exe"), "public, max-age=3600");
});

test("worker: content types for the site's icons, screenshots and search-engine files", () => {
  assert.equal(contentTypeFor("favicon.ico"), "image/x-icon");
  assert.equal(contentTypeFor("favicon.svg"), "image/svg+xml");
  assert.equal(contentTypeFor("robots.txt"), "text/plain; charset=utf-8");
  assert.equal(contentTypeFor("sitemap.xml"), "application/xml; charset=utf-8");
  assert.equal(contentTypeFor("site.webmanifest"), "application/manifest+json");
  assert.equal(contentTypeFor("images/a.jpg"), "image/jpeg");
  assert.equal(contentTypeFor("images/a.JPEG"), "image/jpeg");
  assert.equal(contentTypeFor("images/a.webp"), "image/webp");
  assert.equal(contentTypeFor("images/app-win-light.png"), "image/png");
});

test("worker: site assets are immutable, icons and screenshots keep a day, the rest as before", () => {
  const immutable = "public, max-age=31536000, immutable";
  const day = "public, max-age=86400";
  assert.equal(cacheControlFor("assets/site.0123abcd.css"), immutable);
  assert.equal(cacheControlFor("assets/fonts/deep/x.woff2"), immutable);
  for (const key of ["favicon.ico", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "og-image.png"]) {
    assert.equal(cacheControlFor(key), day, key);
  }
  assert.equal(cacheControlFor("images/app-win-light.png"), day);
  assert.equal(cacheControlFor("images/app-win-dark.png"), day);
  // Only the root icons: a file of the same name elsewhere follows the usual rules.
  assert.equal(cacheControlFor("help/favicon.svg"), "public, max-age=3600");
  assert.equal(cacheControlFor("download/icon-512.png"), "public, max-age=3600");
  assert.equal(cacheControlFor("robots.txt"), "public, max-age=3600");
  assert.equal(cacheControlFor("sitemap.xml"), "public, max-age=3600");
  assert.equal(cacheControlFor("site.webmanifest"), "public, max-age=3600");
  assert.equal(cacheControlFor("help/index.html"), "no-cache");
});

test("worker: icons, screenshots and site files are served with their type, cache rule and ETag", async () => {
  const icon = await get("/favicon.ico");
  assert.equal(icon.status, 200);
  assert.equal(icon.headers.get("content-type"), "image/x-icon");
  assert.equal(icon.headers.get("cache-control"), "public, max-age=86400");
  const etag = icon.headers.get("etag");
  assert.match(etag, /^"[0-9a-f]{64}"$/);
  assert.equal((await get("/favicon.ico", { headers: { "If-None-Match": etag } })).status, 304);

  const shot = await get("/images/app-win-light.png");
  assert.equal(shot.headers.get("content-type"), "image/png");
  assert.equal(shot.headers.get("cache-control"), "public, max-age=86400");

  const css = await get("/assets/site.0123abcd.css");
  assert.equal(css.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.match(css.headers.get("content-type"), /^text\/css/);

  assert.equal((await get("/site.webmanifest")).headers.get("content-type"), "application/manifest+json");
  assert.equal((await get("/robots.txt")).headers.get("content-type"), "text/plain; charset=utf-8");
  const sitemap = await get("/sitemap.xml");
  assert.equal(sitemap.headers.get("content-type"), "application/xml; charset=utf-8");
  assert.equal(await sitemap.text(), files["sitemap.xml"]);
});

test("worker: pages are served, a folder without slash redirects, html files keep their path", async () => {
  const home = await get("/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /^text\/html/);
  assert.equal(home.headers.get("cache-control"), "no-cache");
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await home.text(), files["index.html"]);

  const download = await get("/download/");
  assert.equal(download.status, 200);
  assert.equal(await download.text(), files["download/index.html"]);

  const bare = await get("/download?from=mail");
  assert.equal(bare.status, 308);
  assert.equal(bare.headers.get("location"), "/download/?from=mail");
});

test("worker: hashed assets are cached for good, the installer downloads, latest.json revalidates", async () => {
  const exe = await get("/download/Copyboxx-Setup.exe");
  assert.equal(exe.status, 200);
  assert.equal(exe.headers.get("content-type"), "application/x-msdownload");
  assert.equal(exe.headers.get("content-disposition"), 'attachment; filename="Copyboxx-Setup.exe"');
  assert.equal(exe.headers.get("content-length"), String(Buffer.byteLength(files["download/Copyboxx-Setup.exe"])));
  assert.equal(await exe.text(), files["download/Copyboxx-Setup.exe"]);

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

  const head = await get("/download/Copyboxx-Setup.exe", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-type"), "application/x-msdownload");
  assert.equal(await head.text(), "");

  const post = await get("/", { method: "POST", body: "x" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
});

test("worker: every named export is a function (workerd refuses the workerModule otherwise)", async () => {
  const workerModule = await import("../tools/website/worker.mjs");
  for (const [name, value] of Object.entries(workerModule)) {
    if (name !== "default") assert.equal(typeof value, "function", name);
  }
  assert.equal(typeof workerModule.default.fetch, "function");
});

test("worker: http:// goes to https:// with a 301, every https answer carries HSTS", async () => {
  assert.equal(httpsRedirect("http://copyboxx.com/download/?a=1"), "https://copyboxx.com/download/?a=1");
  assert.equal(httpsRedirect("http://www.copyboxx.com/"), "https://www.copyboxx.com/");
  assert.equal(httpsRedirect("https://copyboxx.com/"), null);

  const env = fakeEnv();
  const plain = await worker.fetch(new Request("http://copyboxx.com/download/Copyboxx-Setup.exe"), env);
  assert.equal(plain.status, 301);
  assert.equal(plain.headers.get("location"), "https://copyboxx.com/download/Copyboxx-Setup.exe");
  assert.equal(plain.headers.get("strict-transport-security"), null);
  assert.deepEqual(env.reads, []);
  const plainPost = await worker.fetch(new Request("http://copyboxx.com/", { method: "POST", body: "x" }), env);
  assert.equal(plainPost.status, 301);

  for (const [path, init, status] of [["/", {}, 200], ["/nothing", {}, 404], ["/download", {}, 308], ["/", { method: "POST", body: "x" }, 405], ["/sync/AB-NOPE0000/snippets.json", {}, 404]]) {
    const response = await get(path, init);
    assert.equal(response.status, status, path);
    assert.equal(response.headers.get("strict-transport-security"), "max-age=15552000", path);
  }
  const etag = (await get("/")).headers.get("etag");
  const cached = await get("/", { headers: { "If-None-Match": etag } });
  assert.equal(cached.status, 304);
  assert.equal(cached.headers.get("strict-transport-security"), "max-age=15552000");
});

test("worker: the web preview is no longer hosted, /preview/ is an ordinary 404", async () => {
  const env = fakeEnv();
  const old = await get("/preview/", {}, env);
  assert.equal(old.status, 404);
  assert.equal(await old.text(), files["404.html"]);
  const post = await get("/preview/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "key=x" }, env);
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("set-cookie"), null);
});

test("worker: company 话术 sync at /sync/<code>/snippets.json, every miss the same plain 404", async () => {
  const library = '{"format":"clipbox-shared-library","version":1,"items":[]}';
  const env = fakeEnv({ ...files, "sync/XS-7KQ2M9AB/snippets.json": library, "sync/XS-7KQ2M9AB/history/snippets-1.json": "old" });
  assert.equal(syncKeyFor("/sync/xs-7kq2m9ab/snippets.json"), "sync/XS-7KQ2M9AB/snippets.json");
  assert.equal(syncKeyFor("/sync/abc/snippets.json"), null);
  assert.equal(syncKeyFor("/sync/XS_7KQ2M9AB/snippets.json"), null);
  assert.equal(syncKeyFor(`/sync/${"A".repeat(41)}/snippets.json`), null);

  for (const path of ["/sync/XS-7KQ2M9AB/snippets.json", "/sync/xs-7kq2m9ab/snippets.json"]) {
    const response = await get(path, {}, env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
    assert.equal(response.headers.get("Cache-Control"), "no-cache");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(response.headers.get("ETag"), `"${createHash("sha256").update(library).digest("hex")}"`);
    assert.equal(await response.text(), library);
  }
  const etag = `"${createHash("sha256").update(library).digest("hex")}"`;
  const cached = await get("/sync/XS-7KQ2M9AB/snippets.json", { headers: { "If-None-Match": etag } }, env);
  assert.equal(cached.status, 304);
  assert.equal(await cached.text(), "");
  const head = await get("/sync/XS-7KQ2M9AB/snippets.json", { method: "HEAD" }, env);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("Content-Length"), String(library.length));

  const misses = ["/sync/AB-NOPE0000/snippets.json", "/sync/ab/snippets.json", "/sync/XS-7KQ2M9AB/history/snippets-1.json", "/sync/", "/sync", "/sync/XS-7KQ2M9AB/"];
  const bodies = new Set();
  for (const path of misses) {
    const response = await get(path, {}, env);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get("Content-Type"), "text/plain; charset=utf-8", path);
    assert.equal(response.headers.get("ETag"), null, path);
    bodies.add(await response.text());
  }
  assert.deepEqual([...bodies], ["404 Not Found"]);
  assert.ok(!env.reads.includes("sync/XS-7KQ2M9AB/history/snippets-1.json"));
});

test("worker: domain bindings (domains/<domain> → 同步码) are never served as files", async () => {
  const env = fakeEnv({ ...files, "domains/company.com": "XS-7KQ2M9AB", "domains/index.html": "x" });
  for (const path of ["/domains", "/domains/", "/domains/company.com", "//domains/company.com", "/%64omains/company.com", "/domains%2Fcompany.com"]) {
    assert.equal(candidateKeys(path), null, path);
    const response = await get(path, {}, env);
    assert.equal(response.status, 404, path);
    assert.ok(!(await response.text()).includes("XS-7KQ2M9AB"), path);
  }
  assert.ok(!env.reads.some((key) => key.startsWith("domains")), env.reads.join(", "));
});
