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
  "contact/index.html": "<title>contact</title>",
  "help/index.html": "<title>help</title>",
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
      async get(key, opts) {
        reads.push(key);
        const file = store.get(key);
        if (!file) return null;
        return opts?.type === "json" ? JSON.parse(file.bytes.toString()) : file.bytes.toString();
      },
      async list({ prefix }) {
        return { keys: [...store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })) };
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

  const contact = await get("/contact/");
  assert.equal(contact.status, 200);
  assert.equal(await contact.text(), files["contact/index.html"]);

  const bare = await get("/help?from=mail");
  assert.equal(bare.status, 308);
  assert.equal(bare.headers.get("location"), "/help/?from=mail");
});

test("worker: the public download is gone (D-092): /download/ goes to the inquiry form, its files are 404", async () => {
  for (const path of ["/download", "/download/"]) {
    const moved = await get(path);
    assert.equal(moved.status, 308, path);
    assert.equal(moved.headers.get("location"), "/contact/");
  }
  for (const path of ["/download/Copyboxx-Setup.exe", "/download/latest.json"]) assert.equal((await get(path)).status, 404, path);
});

test("worker: an installer key downloads as an attachment with its size (the staff files use this)", async () => {
  const env = fakeEnv({ "download/private-t0k3n/Copyboxx-Setup.exe": "MZ fake installer" });
  const exe = await get("/download/private-t0k3n/Copyboxx-Setup.exe", {}, env);
  assert.equal(exe.status, 200);
  assert.equal(exe.headers.get("content-type"), "application/x-msdownload");
  assert.equal(exe.headers.get("content-disposition"), 'attachment; filename="Copyboxx-Setup.exe"');
  assert.equal(exe.headers.get("content-length"), String(Buffer.byteLength("MZ fake installer")));
  assert.equal(await exe.text(), "MZ fake installer");
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

  const head = await get("/download/private-t0k3n/Copyboxx-Setup.exe", { method: "HEAD" }, fakeEnv({ "download/private-t0k3n/Copyboxx-Setup.exe": "MZ fake installer" }));
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

// Staff installers behind the company password (D-080): the password is verified in the Worker, which answers with
// a cookie; the page and the files are only served verified with that cookie, and the page's own source never names
// the files' address.
const staffFiles = {
  ...files,
  "staff/index.html": '<body><form method="post" action="/staff/verify"></form><span id="staff-version"></span></body>',
  "download/private-t0k3n/Copyboxx-Setup.exe": "MZ staff installer",
  "download/private-t0k3n/Copyboxx-macOS-arm64.zip": "PK staff mac",
  "download/private-t0k3n/latest.json": '{"version":"2.0.34"}',
};

function staffVerifyPost(password, env) {
  return get("/staff/verify", { method: "POST", body: new URLSearchParams({ password }), headers: { "CF-Connecting-IP": "1.2.3.4" } }, env);
}

test("worker: /staff/verify sets a cookie for the right password; page and files are only served with it", async () => {
  const env = { ...fakeEnv(staffFiles), STAFF_PASSWORD: "open sesame" };
  const ok = await staffVerifyPost("open sesame", env);
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get("Location"), "/staff/#ok");
  const cookie = ok.headers.get("Set-Cookie");
  assert.match(cookie, /^staff=[0-9a-f]{64}; Path=\/staff; Max-Age=43200; HttpOnly; Secure; SameSite=Lax$/);
  assert.ok(!cookie.includes("open sesame"));
  const Cookie = cookie.split(";")[0];

  const plain = await get("/staff/", {}, env);
  assert.equal(plain.status, 200);
  assert.ok(!(await plain.text()).includes("staff-verified"));
  const verified = await get("/staff/", { headers: { Cookie: `theme=dark; ${Cookie}` } }, env);
  assert.equal(verified.status, 200);
  assert.equal(verified.headers.get("Cache-Control"), "no-store");
  const html = await verified.text();
  assert.ok(html.includes('<body class="staff-verified">'), html);
  assert.ok(html.includes('id="staff-version">2.0.34<'), html);

  const win = await get("/staff/file/win", { headers: { Cookie } }, env);
  assert.equal(win.status, 200);
  assert.equal(win.headers.get("Content-Disposition"), 'attachment; filename="Copyboxx-Setup.exe"');
  assert.equal(win.headers.get("Cache-Control"), "no-store");
  assert.equal(await win.text(), "MZ staff installer");
  const mac = await get("/staff/file/mac", { headers: { Cookie } }, env);
  assert.equal(mac.headers.get("Content-Disposition"), 'attachment; filename="Copyboxx-macOS-arm64.zip"');
  assert.equal(await mac.text(), "PK staff mac");
  assert.equal((await get("/staff/file/linux", { headers: { Cookie } }, env)).status, 404);

  for (const bad of [undefined, "staff=", `staff=${"0".repeat(64)}`, Cookie.slice(0, -1), "staff=open sesame"]) {
    const refused = await get("/staff/file/win", bad ? { headers: { Cookie: bad } } : {}, env);
    assert.equal(refused.status, 303, bad);
    assert.equal(refused.headers.get("Location"), "/staff/");
  }

  for (const password of ["open sesam", "open sesame ", "", "OPEN SESAME"]) {
    const wrong = await staffVerifyPost(password, env);
    assert.equal(wrong.status, 303, password);
    assert.equal(wrong.headers.get("Location"), "/staff/#wrong");
    assert.equal(wrong.headers.get("Set-Cookie"), null);
    assert.equal(await wrong.text(), "");
  }
  assert.equal((await get("/staff/verify", {}, env)).status, 405);
  assert.equal((await get("/staff/verify", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }, env)).status, 400);
  assert.equal((await get("/staff/download", { method: "POST", body: new URLSearchParams({ password: "open sesame", file: "win" }) }, env)).status, 405);
  // The private files stay reachable only by their unlisted address or through the gate: never listed on the site.
  assert.equal((await get("/download/private-t0k3n/Copyboxx-Setup.exe", {}, env)).status, 200);
});

test("worker: /staff/verify without the secret, without the file, and over the hourly limit", async () => {
  assert.equal((await staffVerifyPost("x", fakeEnv(staffFiles))).status, 503);
  assert.equal((await get("/staff/file/win", { headers: { Cookie: `staff=${"a".repeat(64)}` } }, fakeEnv(staffFiles))).status, 303);
  const missing = { ...fakeEnv(files), STAFF_PASSWORD: "pw" };
  const cookie = (await staffVerifyPost("pw", missing)).headers.get("Set-Cookie").split(";")[0];
  assert.equal((await get("/staff/file/win", { headers: { Cookie: cookie } }, missing)).status, 404);

  // A D1 stand-in that counts: the 21st try in the hour is refused before the password is looked at.
  const rows = new Map();
  const db = {
    prepare: (sql) => ({
      bind: (...args) => ({
        first: async () => rows.get(args[0]) ?? null,
        run: async () => {
          if (sql.startsWith("INSERT")) rows.set(args[0], { window_start: args[1], count: 1 });
          else rows.get(args[0]).count += 1;
        },
      }),
    }),
  };
  const env = { ...fakeEnv(staffFiles), STAFF_PASSWORD: "pw", DB: db };
  for (let i = 0; i < 20; i += 1) assert.equal((await staffVerifyPost("bad", env)).status, 303);
  const limited = await staffVerifyPost("pw", env);
  assert.equal(limited.headers.get("Location"), "/staff/#limit");
});

// Inquiry form (D-092): the Turnstile token is checked with Cloudflare, then the inquiry is mailed through Resend to
// the owner's addresses with the visitor as reply-to. `calls` records what the Worker sent out.
function contactPost(fields, env) {
  return get("/contact/send", { method: "POST", body: new URLSearchParams(fields), headers: { "CF-Connecting-IP": "9.8.7.6" } }, env);
}

async function withOutside(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: init?.body });
    return handler(url, init);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const inquiry = { name: "王小明", email: " Ming@Example.com ", company: "示例公司", message: "想给 5 台电脑装，Windows 的。", "cf-turnstile-response": "tok-1" };

test("worker: /contact/send checks the Turnstile token, mails the owner with reply-to, and goes back to #sent", async () => {
  const env = { ...fakeEnv(), TURNSTILE_SECRET: "ts-secret", RESEND_API_KEY: "re-key", ADMIN_EMAILS: "owner@example.com, Boss@example.com" };
  const answer = (url) => (url.includes("turnstile") ? Response.json({ success: true }) : Response.json({ id: "m1" }));
  await withOutside(answer, async (calls) => {
    const sent = await contactPost(inquiry, env);
    assert.equal(sent.status, 303);
    assert.equal(sent.headers.get("Location"), "/contact/#sent");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(new URLSearchParams(calls[0].body).get("response"), "tok-1");
    assert.equal(new URLSearchParams(calls[0].body).get("remoteip"), "9.8.7.6");
    assert.equal(calls[1].url, "https://api.resend.com/emails");
    const mail = JSON.parse(calls[1].body);
    assert.equal(mail.from, "Copyboxx <noreply@copyboxx.com>");
    assert.deepEqual(mail.to, ["owner@example.com", "boss@example.com"]);
    assert.equal(mail.reply_to, "ming@example.com");
    assert.equal(mail.subject, "Copyboxx 询单：王小明（示例公司）");
    assert.match(mail.text, /姓名：王小明\n邮箱：ming@example.com\n公司：示例公司\n\n想给 5 台电脑装，Windows 的。/);
  });

  // A refused token sends nothing; a missing one is not even checked.
  await withOutside(() => Response.json({ success: false }), async (calls) => {
    assert.equal((await contactPost(inquiry, env)).headers.get("Location"), "/contact/#captcha");
    assert.equal(calls.length, 1);
    assert.equal((await contactPost({ ...inquiry, "cf-turnstile-response": "" }, env)).headers.get("Location"), "/contact/#captcha");
    assert.equal(calls.length, 1);
  });
  // Missing or bad fields are refused before the token costs a call.
  await withOutside(() => Response.json({ success: true }), async (calls) => {
    for (const bad of [{ ...inquiry, email: "not-an-address" }, { ...inquiry, name: "  " }, { ...inquiry, message: "" }]) {
      assert.equal((await contactPost(bad, env)).headers.get("Location"), "/contact/#bad");
    }
    assert.equal(calls.length, 0);
  });
  // Resend down: back to #failed.
  await withOutside((url) => (url.includes("turnstile") ? Response.json({ success: true }) : new Response("no", { status: 500 })), async () => {
    assert.equal((await contactPost(inquiry, env)).headers.get("Location"), "/contact/#failed");
  });
  // Not set up (no Turnstile secret, no mail key or no owner address): 503, nothing sent.
  await withOutside(() => Response.json({ success: true }), async (calls) => {
    for (const missing of ["TURNSTILE_SECRET", "RESEND_API_KEY", "ADMIN_EMAILS"]) {
      assert.equal((await contactPost(inquiry, { ...env, [missing]: "" })).status, 503, missing);
    }
    assert.equal(calls.length, 0);
  });
  assert.equal((await get("/contact/send", {}, env)).status, 405);
  assert.equal((await get("/contact/send", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }, env)).status, 400);
});

test("worker: /contact/send allows 5 inquiries per IP and hour", async () => {
  const rows = new Map();
  const db = {
    prepare: (sql) => ({
      bind: (...args) => ({
        first: async () => rows.get(args[0]) ?? null,
        run: async () => {
          if (sql.startsWith("INSERT")) rows.set(args[0], { window_start: args[1], count: 1 });
          else rows.get(args[0]).count += 1;
        },
      }),
    }),
  };
  const env = { ...fakeEnv(), TURNSTILE_SECRET: "s", RESEND_API_KEY: "k", ADMIN_EMAILS: "owner@example.com", DB: db };
  await withOutside(() => Response.json({ success: true }), async (calls) => {
    for (let i = 0; i < 5; i += 1) assert.equal((await contactPost(inquiry, env)).headers.get("Location"), "/contact/#sent");
    assert.equal((await contactPost(inquiry, env)).headers.get("Location"), "/contact/#limit");
    assert.equal(calls.length, 10);
  });
});
