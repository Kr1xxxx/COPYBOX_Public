import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import worker, {
  cacheControlFor,
  candidateKeys,
  contentTypeFor,
  cookieToken,
  isPreviewKey,
  parseCookies,
  secretMatches,
} from "../tools/website/worker.mjs";

const files = {
  "index.html": "<title>home</title>",
  "404.html": "<title>找不到这个页面</title>",
  "preview-gate.html": '<title>网页测试版 · Clipboxx</title><h1>输入口令</h1><form method="post" action="/preview/"></form><p class="msg">__MESSAGE__</p>',
  "preview/index.html": "<title>preview</title>",
  "preview/app-win.html": "<title>app</title>",
  "preview/assets/static/x.js": "console.log(1);",
  "download/Clipboxx-Setup.exe": "MZ fake installer",
  "download/latest.json": '{"version":"1.65.0"}',
};

function fakeEnv(entries = files, vars = { PREVIEW_SECRET: "Comely" }) {
  const store = new Map(
    Object.entries(entries).map(([key, text]) => {
      const bytes = Buffer.from(text);
      return [key, { bytes, metadata: { type: contentTypeFor(key), sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length } }];
    }),
  );
  const reads = [];
  return {
    ...vars,
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

// The preview_pass cookie a right passphrase gives (the secret is normalized, so "Comely" and "comely" agree).
async function withPass(init = {}) {
  const token = await cookieToken("comely");
  return { ...init, headers: { ...init.headers, Cookie: `other=1; preview_pass=${token}` } };
}

function postKey(value, env) {
  return get(
    "/preview/",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ key: value }).toString() },
    env,
  );
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
  assert.equal(cacheControlFor("preview/seed.js"), "no-cache");
  assert.equal(cacheControlFor("preview/samples/1-inquiry-quote.csv"), "no-cache");
  assert.equal(cacheControlFor("download/Clipboxx-Setup.exe"), "public, max-age=3600");
});

test("worker: pages are served, a folder without slash redirects, html files keep their path", async () => {
  const home = await get("/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /^text\/html/);
  assert.equal(home.headers.get("cache-control"), "no-cache");
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await home.text(), files["index.html"]);

  const preview = await get("/preview/", await withPass());
  assert.equal(preview.status, 200);
  assert.equal(await preview.text(), files["preview/index.html"]);

  const bare = await get("/preview");
  assert.equal(bare.status, 308);
  assert.equal(bare.headers.get("location"), "/preview/");

  const app = await get("/preview/app-win.html", await withPass());
  assert.equal(app.status, 200);
  assert.equal(await app.text(), files["preview/app-win.html"]);
});

test("worker: hashed assets are cached for good, the installer downloads, latest.json revalidates", async () => {
  const chunk = await get("/preview/assets/static/x.js", await withPass());
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

test("worker: every named export is a function (workerd refuses the workerModule otherwise)", async () => {
  const workerModule = await import("../tools/website/worker.mjs");
  for (const [name, value] of Object.entries(workerModule)) {
    if (name !== "default") assert.equal(typeof value, "function", name);
  }
  assert.equal(typeof workerModule.default.fetch, "function");
});

test("worker: passphrase helpers", async () => {
  for (const input of ["comely", "COMELY", " Comely ", "comely\n"]) assert.equal(secretMatches(input, "Comely"), true, input);
  assert.equal(secretMatches("comel", "comely"), false);
  assert.equal(secretMatches("", "comely"), false);
  assert.equal(secretMatches("", ""), false);
  assert.equal(secretMatches(undefined, undefined), false);
  assert.equal(secretMatches("  ", " "), false);
  const token = await cookieToken("comely");
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(token, createHash("sha256").update("clipboxx-preview:comely").digest("hex"));
  assert.equal(await cookieToken(" COMELY "), token);
  const cookies = parseCookies("a=1; preview_pass=abc ;b=x=y; bare");
  assert.equal(cookies.get("a"), "1");
  assert.equal(cookies.get("preview_pass"), "abc");
  assert.equal(cookies.get("b"), "x=y");
  assert.equal(cookies.has("bare"), false);
  assert.equal(parseCookies(null).size, 0);
  assert.equal(isPreviewKey("preview"), true);
  assert.equal(isPreviewKey("preview/index.html"), true);
  assert.equal(isPreviewKey("preview-gate.html"), false);
  assert.equal(isPreviewKey("previews/x"), false);
  assert.equal(isPreviewKey("index.html"), false);
});

test("worker: without the pass, preview pages show the passphrase page and files answer 401", async () => {
  const gate = await get("/preview/");
  assert.equal(gate.status, 401);
  assert.equal(gate.headers.get("cache-control"), "no-cache");
  assert.equal(gate.headers.get("etag"), null);
  assert.equal(gate.headers.get("content-type"), "text/html; charset=utf-8");
  const html = await gate.text();
  assert.match(html, /输入口令/);
  assert.doesNotMatch(html, /__MESSAGE__/);
  assert.match(html, /<p class="msg"><\/p>/);

  const app = await get("/preview/app-win.html");
  assert.equal(app.status, 401);
  assert.match(await app.text(), /输入口令/);

  const head = await get("/preview/", { method: "HEAD" });
  assert.equal(head.status, 401);
  assert.equal(await head.text(), "");

  const chunk = await get("/preview/assets/static/x.js");
  assert.equal(chunk.status, 401);
  assert.equal(chunk.headers.get("cache-control"), "no-cache");
  assert.match(chunk.headers.get("content-type"), /^text\/plain/);
  assert.equal(await chunk.text(), "需要口令");

  // A path that does not exist looks the same as one that does.
  assert.equal((await get("/preview/assets/static/missing.js")).status, 401);

  const bare = await get("/preview");
  assert.equal(bare.status, 308);
  assert.equal(bare.headers.get("location"), "/preview/");

  const wrongCookie = await get("/preview/", { headers: { Cookie: `preview_pass=${"0".repeat(64)}` } });
  assert.equal(wrongCookie.status, 401);
  assert.match(await wrongCookie.text(), /输入口令/);
  const oldSecret = await get("/preview/", { headers: { Cookie: `preview_pass=${await cookieToken("other")}` } });
  assert.equal(oldSecret.status, 401);
});

test("worker: the right passphrase sets the cookie, a wrong one shows the page again", async () => {
  const ok = await postKey("COMELY ");
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get("location"), "/preview/");
  const cookie = ok.headers.get("set-cookie");
  const token = cookie.match(/^preview_pass=([0-9a-f]{64});/)?.[1];
  assert.ok(token, cookie);
  assert.equal(token, await cookieToken("comely"));
  for (const part of ["HttpOnly", "Secure", "Path=/preview", "SameSite=Lax", "Max-Age=2592000"]) assert.ok(cookie.split("; ").includes(part), part);

  const wrong = await postKey("comel");
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get("set-cookie"), null);
  assert.equal(wrong.headers.get("cache-control"), "no-cache");
  assert.match(await wrong.text(), /<p class="msg">口令不对，再试一次<\/p>/);

  const notForm = await get("/preview/", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"key":"comely"}' });
  assert.equal(notForm.status, 401);

  const pass = { headers: { Cookie: `preview_pass=${token}` } };
  const page = await get("/preview/", pass);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), files["preview/index.html"]);
  assert.match(page.headers.get("etag"), /^"[0-9a-f]{64}"$/);
  assert.equal((await get("/preview/app-win.html", pass)).status, 200);
  const chunk = await get("/preview/assets/static/x.js", pass);
  assert.equal(chunk.status, 200);
  assert.equal(chunk.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal((await get("/preview", pass)).status, 308);
  assert.equal((await get("/preview/nothing.html", pass)).status, 404);
});

test("worker: the rest of the site does not ask for the passphrase", async () => {
  assert.equal((await get("/")).status, 200);
  assert.equal((await get("/download/Clipboxx-Setup.exe")).status, 200);
  assert.equal((await get("/download/latest.json")).status, 200);
  const missing = await get("/nothing");
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), files["404.html"]);
  for (const path of ["/", "/preview/app-win.html", "/preview", "/download/latest.json"]) {
    const post = await get(path, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "key=comely" });
    assert.equal(post.status, 405, path);
  }
  assert.equal((await get("/preview/", { method: "PUT", body: "x" })).status, 405);
});

test("worker: without a passphrase configured nobody gets in", async () => {
  for (const vars of [{}, { PREVIEW_SECRET: "" }, { PREVIEW_SECRET: "   " }]) {
    const env = fakeEnv(files, vars);
    const gate = await get("/preview/", {}, env);
    assert.equal(gate.status, 401);
    assert.match(await gate.text(), /网页测试版暂未开放/);
    const post = await postKey("comely", env);
    assert.equal(post.status, 401);
    assert.equal(post.headers.get("set-cookie"), null);
    assert.match(await post.text(), /网页测试版暂未开放/);
    assert.equal((await postKey("", env)).status, 401);
    const blankCookie = await get("/preview/", { headers: { Cookie: `preview_pass=${await cookieToken("")}` } }, env);
    assert.equal(blankCookie.status, 401);
  }
});

test("worker: the passphrase page has an inline fallback when its KV key is missing", async () => {
  const rest = Object.fromEntries(Object.entries(files).filter(([key]) => key !== "preview-gate.html"));
  const env = fakeEnv(rest);
  const gate = await get("/preview/", {}, env);
  assert.equal(gate.status, 401);
  const html = await gate.text();
  assert.match(html, /输入口令/);
  assert.match(html, /action="\/preview\/"/);
  assert.doesNotMatch(html, /__MESSAGE__/);
  const wrong = await postKey("nope", env);
  assert.match(await wrong.text(), /口令不对，再试一次/);
});
