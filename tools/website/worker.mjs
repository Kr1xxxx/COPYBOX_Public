// Cloudflare Worker for copyboxx.com: serves the files of dist-website/ from the KV namespace bound as FILES.
// Keys are paths relative to dist-website/ ("index.html", "preview/assets/static/…"); the metadata
// { type, sha256, size } is written by build.mjs (kv-bulk.json) and uploaded by deploy.mjs.

const types = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  png: "image/png",
  svg: "image/svg+xml",
  woff2: "font/woff2",
  csv: "text/csv; charset=utf-8",
  exe: "application/x-msdownload",
};

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
  if (key.startsWith("preview/assets/")) return "public, max-age=31536000, immutable";
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
  if (extensionOf(key) === "exe") headers.set("Content-Disposition", 'attachment; filename="Clipboxx-Setup.exe"');
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

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const url = new URL(request.url);
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
  },
};
