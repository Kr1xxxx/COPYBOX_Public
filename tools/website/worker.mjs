// Cloudflare Worker for copyboxx.com: serves the files of dist-website/ from the KV namespace bound as FILES.
// Keys are paths relative to dist-website/ ("index.html", "preview/assets/static/…"); the metadata
// { type, sha256, size } is written by build.mjs (kv-bulk.json) and uploaded by deploy.mjs.
// Everything under /preview/ asks for a passphrase first (env.PREVIEW_SECRET, set in wrangler.jsonc): a light gate
// for colleagues, not a security boundary. A right answer sets the cookie preview_pass for 30 days.

const types = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  woff2: "font/woff2",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  webmanifest: "application/manifest+json",
  exe: "application/x-msdownload",
};

// Icons at the site root and the screenshots under images/ keep their names across releases: cache them for a day
// and let the ETag revalidate after that.
const rootIcons = new Set(["favicon.ico", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "og-image.png"]);

function extensionOf(key) {
  const name = key.slice(key.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function contentTypeFor(key) {
  return types[extensionOf(key)] ?? "application/octet-stream";
}

export function cacheControlFor(key) {
  const ext = extensionOf(key);
  if (ext === "html" || ext === "json") return "no-cache";
  if (key.startsWith("assets/") || key.startsWith("preview/assets/")) return "public, max-age=31536000, immutable";
  if (key.startsWith("images/") || rootIcons.has(key)) return "public, max-age=86400";
  // seed.js, image-store.js and the sample sheets have no hash in their names: a new preview must not run with old ones.
  if (key.startsWith("preview/")) return "no-cache";
  return "public, max-age=3600";
}

// What to look up for a request path, in order: [{ key, redirect? }]. A hit on an entry with `redirect` answers
// 308 to that path instead of the file (so "/preview" goes to "/preview/"). null means the path is not allowed.
export function candidateKeys(pathname) {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (path.includes("..") || path.includes("\\") || path.includes("\0")) return null;
  const key = path.replace(/^\/+/, "");
  if (key === "" || key.endsWith("/")) return [{ key: `${key}index.html` }];
  const candidates = [{ key }];
  if (!extensionOf(key)) candidates.push({ key: `${key}/index.html`, redirect: `${pathname}/` });
  return candidates;
}

function matchesEtag(header, etag) {
  if (!header) return false;
  return header.split(",").some((tag) => {
    const value = tag.trim().replace(/^W\//, "");
    return value === "*" || value === etag;
  });
}

function release(value) {
  if (value && typeof value.cancel === "function") value.cancel().catch(() => {});
}

function fileResponse(request, key, file, status = 200) {
  const meta = file.metadata ?? {};
  const headers = new Headers({
    "Content-Type": meta.type || contentTypeFor(key),
    "Cache-Control": status === 200 ? cacheControlFor(key) : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  if (extensionOf(key) === "exe") headers.set("Content-Disposition", 'attachment; filename="Copyboxx-Setup.exe"');
  if (status === 200 && meta.sha256) {
    const etag = `"${meta.sha256}"`;
    headers.set("ETag", etag);
    if (matchesEtag(request.headers.get("If-None-Match"), etag)) {
      release(file.value);
      headers.delete("Content-Type");
      return new Response(null, { status: 304, headers });
    }
  }
  if (Number.isInteger(meta.size)) headers.set("Content-Length", String(meta.size));
  if (request.method === "HEAD") {
    release(file.value);
    return new Response(null, { status, headers });
  }
  return new Response(file.value, { status, headers });
}

async function notFound(request, env) {
  const page = await env.FILES.getWithMetadata("404.html", { type: "stream" });
  if (page?.value != null) return fileResponse(request, "404.html", page, 404);
  return new Response(request.method === "HEAD" ? null : "404 Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" },
  });
}

// Company 话术 sync (docs/shared-library.md): GET /sync/<code>/snippets.json reads the KV key
// sync/<CODE>/snippets.json, written by tools/website/sync.mjs. Codes are upper case (typed lower case works too).
// A malformed code, a missing key and every other path under /sync/ get the same plain 404, so the answer never
// tells which codes exist; history copies under sync/<code>/history/ are never served.
export function syncKeyFor(pathname) {
  const match = /^\/sync\/([A-Za-z0-9-]{6,40})\/snippets\.json$/.exec(pathname);
  return match ? `sync/${match[1].toUpperCase()}/snippets.json` : null;
}

export function isSyncPath(pathname) {
  return pathname === "/sync" || pathname.startsWith("/sync/");
}

function syncHeaders() {
  return { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" };
}

function syncNotFound(request) {
  return new Response(request.method === "HEAD" ? null : "404 Not Found", {
    status: 404,
    headers: { ...syncHeaders(), "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function syncResponse(request, env, pathname) {
  const key = syncKeyFor(pathname);
  if (!key) return syncNotFound(request);
  const file = await env.FILES.getWithMetadata(key, { type: "text" });
  if (typeof file?.value !== "string") return syncNotFound(request);
  const etag = `"${await sha256Hex(file.value)}"`;
  const headers = new Headers({ ...syncHeaders(), ETag: etag });
  if (matchesEtag(request.headers.get("If-None-Match"), etag)) return new Response(null, { status: 304, headers });
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Content-Length", String(new TextEncoder().encode(file.value).length));
  return new Response(request.method === "HEAD" ? null : file.value, { status: 200, headers });
}

// Only functions may be named exports of a Worker module (workerd refuses anything else), so constants stay private.
const previewCookie = "preview_pass";
const cookieAttributes = "Path=/preview; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000";
const gateKey = "preview-gate.html";
const gateMessages = { closed: "网页测试版暂未开放", wrong: "口令不对，再试一次" };

function normalizeSecret(value) {
  return String(value ?? "").trim().toLowerCase();
}

// Case-insensitive, surrounding spaces ignored; an empty passphrase never matches (so a missing secret fails closed).
export function secretMatches(input, secret) {
  const wanted = normalizeSecret(secret);
  return wanted !== "" && normalizeSecret(input) === wanted;
}

// The cookie value: hex SHA-256 of "clipboxx-preview:" + the normalized passphrase.
export async function cookieToken(secret) {
  const bytes = new TextEncoder().encode(`clipboxx-preview:${normalizeSecret(secret)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name && !cookies.has(name)) cookies.set(name, part.slice(eq + 1).trim());
  }
  return cookies;
}

export function isPreviewKey(key) {
  return key === "preview" || key.startsWith("preview/");
}

async function hasPreviewPass(request, env) {
  if (!normalizeSecret(env.PREVIEW_SECRET)) return false;
  const value = parseCookies(request.headers.get("Cookie")).get(previewCookie);
  return Boolean(value) && value === (await cookieToken(env.PREVIEW_SECRET));
}

const gateFallback = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>网页测试版 · Copyboxx</title></head><body>
<h1>输入口令</h1><p>网页测试版只给内部同事看，请输入口令。</p>
<form method="post" action="/preview/"><input name="key" type="password" autocomplete="off" aria-label="口令"> <button type="submit">进入</button></form>
<p>__MESSAGE__</p><p><a href="/">回到首页</a></p>
</body></html>`;

// The passphrase page (KV key preview-gate.html, or the inline fallback), always 401 and never cached or tagged.
async function gatePage(request, env, message = "") {
  const closed = !normalizeSecret(env.PREVIEW_SECRET);
  const page = await env.FILES.getWithMetadata(gateKey, { type: "text" });
  const template = typeof page?.value === "string" ? page.value : gateFallback;
  const html = template.replaceAll("__MESSAGE__", closed ? gateMessages.closed : message);
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" };
  return new Response(request.method === "HEAD" ? null : html, { status: 401, headers });
}

function needPass(request) {
  return new Response(request.method === "HEAD" ? null : "需要口令", {
    status: 401,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" },
  });
}

async function submitPass(request, env) {
  let input = "";
  try {
    const form = await request.formData();
    input = form.get("key") ?? "";
  } catch {
    input = "";
  }
  if (!secretMatches(input, env.PREVIEW_SECRET)) return gatePage(request, env, gateMessages.wrong);
  const token = await cookieToken(env.PREVIEW_SECRET);
  return new Response(null, {
    status: 303,
    headers: { Location: "/preview/", "Set-Cookie": `${previewCookie}=${token}; ${cookieAttributes}`, "Cache-Control": "no-cache" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/preview/") return submitPass(request, env);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    if (isSyncPath(url.pathname)) return syncResponse(request, env, url.pathname);
    const candidates = candidateKeys(url.pathname);
    if (!candidates) return notFound(request, env);
    const locked = isPreviewKey(candidates[0].key) && !(await hasPreviewPass(request, env));
    for (const { key, redirect } of candidates) {
      // Without the pass only the folder redirect ("/preview" → "/preview/") answers; it reveals nothing.
      if (locked && !redirect) continue;
      const file = await env.FILES.getWithMetadata(key, { type: "stream" });
      if (file?.value == null) continue;
      if (redirect) {
        release(file.value);
        return new Response(null, { status: 308, headers: { Location: redirect + url.search, "Cache-Control": "no-cache" } });
      }
      return fileResponse(request, key, file);
    }
    if (locked) return extensionOf(candidates[0].key) === "html" ? gatePage(request, env) : needPass(request);
    return notFound(request, env);
  },
};
