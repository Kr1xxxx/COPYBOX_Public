// Fetches a website's own small icon (favicon) once, so the 保险箱 can show it in front of an entry.
// Only the site itself is asked, never an icon service. Plain GET with no cookies, https only, public addresses only,
// redirects only within the same site, images only (no SVG), size-limited. The page stores the answer encrypted.
const dns = require("node:dns").promises;
const net = require("node:net");

const TIMEOUT_MS = 6000;
const MAX_ICON_BYTES = 100 * 1024;
const MAX_HTML_BYTES = 200 * 1024;
const MAX_REDIRECTS = 3;
const TWO_PART_SUFFIX = new Set(["co.uk", "com.cn", "com.au", "co.jp", "com.hk", "com.tw", "com.br", "co.in", "org.uk", "net.cn"]);
const HOST_PATTERN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function normalizeHost(value) {
  const host = String(value || "").trim().toLowerCase().replace(/\.$/, "");
  return HOST_PATTERN.test(host) ? host : "";
}

function siteOf(host) {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  return parts.slice(TWO_PART_SUFFIX.has(parts.slice(-2).join(".")) ? -3 : -2).join(".");
}

function isPrivateAddress(address) {
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
    return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  const [a, b] = address.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

async function assertPublicHost(host, lookup) {
  const records = await lookup(host, { all: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) throw new Error("not public");
}

function sniffImage(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return "image/x-icon";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 4)) === "GIF8") return "image/gif";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return "";
}

async function readLimited(response, maxBytes) {
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error("too big");
  return buffer;
}

// GET that follows redirects by hand, so every hop stays https, on the same site and on a public address.
async function getWithGuards(startUrl, origin, { fetchImpl, lookup, timeoutMs }) {
  let url = new URL(startUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("not allowed");
    if (siteOf(normalizeHost(url.hostname)) !== siteOf(origin)) throw new Error("other site");
    await assertPublicHost(url.hostname, lookup);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { method: "GET", redirect: "manual", credentials: "omit", cache: "no-store", headers: { accept: "image/*,text/html;q=0.5" }, signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("bad redirect");
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) throw new Error("not ok");
      return { response, url, release: () => clearTimeout(timer) };
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
  }
  throw new Error("too many redirects");
}

function iconLinkFrom(html, baseUrl) {
  const candidates = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = /\brel\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]?.toLowerCase() || "";
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (!href || !rel.split(/\s+/).includes("icon") || /\.svg(\?|$)/i.test(href)) continue;
    try { candidates.push(new URL(href, baseUrl)); } catch { /* ignore a broken address */ }
  }
  return candidates[0];
}

async function loadImage(url, origin, deps) {
  const { response, release } = await getWithGuards(url, origin, deps);
  try {
    const bytes = await readLimited(response, MAX_ICON_BYTES);
    const type = sniffImage(bytes);
    return type ? `data:${type};base64,${bytes.toString("base64")}` : "";
  } finally {
    release();
  }
}

// Returns a data: URL, or "" when the site has no usable icon (or is unreachable). Never throws.
async function fetchSiteIcon(value, { fetchImpl = fetch, lookup = dns.lookup, timeoutMs = TIMEOUT_MS } = {}) {
  const host = normalizeHost(value);
  if (!host) return "";
  const deps = { fetchImpl, lookup, timeoutMs };
  try {
    const direct = await loadImage(`https://${host}/favicon.ico`, host, deps).catch(() => "");
    if (direct) return direct;
    const { response, url, release } = await getWithGuards(`https://${host}/`, host, deps);
    let html;
    try { html = (await readLimited(response, MAX_HTML_BYTES)).toString("utf8"); } finally { release(); }
    const link = iconLinkFrom(html, url);
    return link ? await loadImage(link, host, deps) : "";
  } catch {
    return "";
  }
}

module.exports = { fetchSiteIcon, normalizeHost, isPrivateAddress, sniffImage, iconLinkFrom };
