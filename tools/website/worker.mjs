// Cloudflare Worker for copyboxx.com: serves the files of dist-website/ from the KV namespace bound as FILES.
// Keys are paths relative to dist-website/ ("index.html", "assets/site.….css"); the metadata
// { type, sha256, size } is written by build.mjs (kv-bulk.json) and uploaded by deploy.mjs.
// Plain http:// requests are sent to https:// (301), and every https answer carries HSTS, so a first download of the
// installer cannot be swapped on the way (audit S2, 2026-10-14). The site no longer hosts the web preview (owner,
// 2026-10-14): /preview/ is an ordinary 404. /api/* is the account and sync API (api.mjs, D-063);
// /admin is the owner's read-only user list (admin.mjs, D-065).

import { handleAdmin, isAdminPath } from "./admin.mjs";
import { handleApi, isApiPath } from "./api.mjs";

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
  if (key.startsWith("assets/")) return "public, max-age=31536000, immutable";
  if (key.startsWith("images/") || rootIcons.has(key)) return "public, max-age=86400";
  return "public, max-age=3600";
}

// What to look up for a request path, in order: [{ key, redirect? }]. A hit on an entry with `redirect` answers
// 308 to that path instead of the file (so "/download" goes to "/download/"). null means the path is not allowed.
export function candidateKeys(pathname) {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (path.includes("..") || path.includes("\\") || path.includes("\0")) return null;
  const key = path.replace(/^\/+/, "");
  // domains/<domain> holds the 同步码 bound to an email domain (sync.mjs --link-domain): never served as a file.
  if (key === "domains" || key.startsWith("domains/")) return null;
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
// Six months, no preload (the audit thread's advice), so a mistake can still be undone.
const hsts = "max-age=15552000";

// The https:// address of a plain http:// request, or null when the request is already https.
export function httpsRedirect(requestUrl) {
  const url = new URL(requestUrl);
  if (url.protocol !== "http:") return null;
  url.protocol = "https:";
  return url.href;
}

async function serve(request, env) {
  const url = new URL(request.url);
  if (isApiPath(url.pathname)) return handleApi(request, env);
  if (isAdminPath(url.pathname)) return handleAdmin(request, env);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  if (isSyncPath(url.pathname)) return syncResponse(request, env, url.pathname);
  const candidates = candidateKeys(url.pathname);
  if (!candidates) return notFound(request, env);
  for (const { key, redirect } of candidates) {
    const file = await env.FILES.getWithMetadata(key, { type: "stream" });
    if (file?.value == null) continue;
    if (redirect) {
      release(file.value);
      return new Response(null, { status: 308, headers: { Location: redirect + url.search, "Cache-Control": "no-cache" } });
    }
    return fileResponse(request, key, file);
  }
  return notFound(request, env);
}

export default {
  async fetch(request, env) {
    const secure = httpsRedirect(request.url);
    if (secure) return new Response(null, { status: 301, headers: { Location: secure, "Cache-Control": "no-cache" } });
    const response = await serve(request, env);
    response.headers.set("Strict-Transport-Security", hsts);
    return response;
  },
};
