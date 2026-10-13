// Builds the public website for copyboxx.com (see README.md):
//   node tools/website/build.mjs [--installer <file>] [--preview <dir>] [--out <dir>] [--icons <dir>] [--images <dir>]
// Defaults: --preview dist-preview, --out dist-website (relative to the repo root), --icons tools/website/icons,
// --images tools/website/images. Without --installer the newest tauri-test-N Windows installer is downloaded from
// GitHub Releases (GITHUB_TOKEN or GH_TOKEN is sent when set; the repo is private). In the Claude cloud environment
// Node's fetch only goes through the proxy with NODE_USE_ENV_PROXY=1.
// Every page is partials/head.html + partials/header.html (current nav item marked) + its body + partials/footer.html;
// the stylesheet becomes assets/site.<hash>.css. Besides the site files it writes kv-bulk.json and manifest.json,
// which deploy.mjs uploads to KV for worker.mjs.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { previewBuildInfo } from "../preview/build.mjs";
import { appVersionFrom } from "../../scripts/sync-version.mjs";
import { contentTypeFor } from "./worker.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const previewDir = join(repo, "tools/preview");

export const siteUrl = "https://copyboxx.com";
export const installerPath = "download/Copyboxx-Setup.exe";
const releasesApi = "https://api.github.com/repos/Kr1xxxx/Clipbox/releases?per_page=20";

const placeholder = /__([A-Z0-9]+(?:_[A-Z0-9]+)*)__/g;

// Fills __VERSION__, __UPDATED__, __SIZE__ (and __SHA256__ when info.sha256 is given) plus any `values`
// ({ PAGE_TITLE: "…" } fills __PAGE_TITLE__) in one pass, so filled-in text is never scanned again. A placeholder
// without a value throws (the template and this build disagree), except the names in `keep`, which stay for the
// Worker (preview-gate.html keeps __MESSAGE__).
export function renderPage(template, info, values = {}, keep = []) {
  const all = {
    VERSION: String(info.version).trim(),
    UPDATED: String(info.updated),
    SIZE: String(info.size),
    ...(info.sha256 === undefined ? {} : { SHA256: String(info.sha256) }),
    ...values,
  };
  const missing = [];
  const html = template.replace(placeholder, (match, name) => {
    if (Object.hasOwn(all, name)) return String(all[name]);
    if (!keep.includes(name)) missing.push(match);
    return match;
  });
  if (missing.length) throw new Error(`Placeholder ${missing[0]} was not filled.`);
  return html;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Every page of the site: body source (relative to tools/website/), published key, canonical path, nav item, head
// text. 404.html and preview-gate.html are left out of the sitemap and carry noindex.
export const sitePages = [
  { source: "pages/index.html", key: "index.html", path: "/", nav: "HOME", title: "Copyboxx · 复制盒",
    description: "Copyboxx（复制盒）把常用话术、账号资料和图片存在自己电脑上，点一下就复制。不用注册，不用联网，内容加密保存。" },
  { source: "pages/download.html", key: "download/index.html", path: "/download/", nav: "DOWNLOAD", title: "下载 · Copyboxx",
    description: "下载 Copyboxx（复制盒）Windows 版，附安装步骤、安装时的提示和从旧版搬数据的方法。" },
  { source: "pages/help.html", key: "help/index.html", path: "/help/", nav: "HELP", title: "使用说明 · Copyboxx",
    description: "Copyboxx（复制盒）怎么用：话术、账号、图片、托盘小窗、备份与恢复、公司共享话术、AI 润色和整理。" },
  { source: "pages/privacy.html", key: "privacy/index.html", path: "/privacy/", nav: "", title: "隐私说明 · Copyboxx",
    description: "Copyboxx（复制盒）不收集你的内容：没有账号，没有服务器，数据加密后只保存在你的电脑上。" },
  { source: "404.html", key: "404.html", path: "/", nav: "", title: "找不到这个页面 · Copyboxx",
    description: "找不到这个页面。", noindex: true },
  { source: "preview-gate.html", key: "preview-gate.html", path: "/preview/", nav: "", title: "网页测试版 · Copyboxx",
    description: "Copyboxx 网页测试版，需要口令。", noindex: true, keep: ["MESSAGE"] },
];
const navItems = ["HOME", "DOWNLOAD", "HELP"];

// One page: head + header (its nav item gets aria-current="page") + body + footer, every placeholder filled.
// parts: { head, header, body, footer }; extra: more values such as { CSS }.
export function assemblePage(page, parts, info, extra = {}) {
  const nav = Object.fromEntries(navItems.map((name) => [`NAV_${name}`, name === page.nav ? ' aria-current="page"' : ""]));
  const template = parts.head + parts.header + parts.body + parts.footer;
  const values = {
    PAGE_TITLE: escapeHtml(page.title),
    PAGE_DESCRIPTION: escapeHtml(page.description),
    CANONICAL: `${siteUrl}${page.path}`,
    ROBOTS: page.noindex ? '<meta name="robots" content="noindex">\n' : "",
    ...nav,
    ...extra,
  };
  return renderPage(template, info, values, page.keep ?? []);
}

// assets/site.<first 8 hex of the sha256>.css: a changed stylesheet gets a new name, so it can be cached for good.
export function cssAssetKey(css) {
  return `assets/site.${createHash("sha256").update(css).digest("hex").slice(0, 8)}.css`;
}

// Made by hand with make-icons.mjs and make-screenshots.mjs; the build only warns when one is missing.
export const iconFiles = ["favicon.ico", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "og-image.png"];
export const imageFiles = ["app-win-light.png", "app-win-dark.png"];

export function webManifest() {
  return {
    name: "Copyboxx 复制盒",
    short_name: "Copyboxx",
    lang: "zh-CN",
    start_url: "/",
    display: "browser",
    background_color: "#f8fafc",
    theme_color: "#f8fafc",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}

export function robotsTxt() {
  return `User-agent: *\nDisallow: /preview/\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

// The indexable pages with lastmod = the update date ("YYYY-MM-DD"). The namespace is an identifier, not a link,
// and has to stay exactly as the sitemap protocol spells it.
export function sitemapXml(updated) {
  const urls = sitePages
    .filter((page) => !page.noindex)
    .map((page) => `  <url><loc>${siteUrl}${page.path}</loc><lastmod>${escapeHtml(updated)}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// Copies the files directly in `from` into `to`. A missing folder or expected file only warns: the icons and
// screenshots are made separately and committed.
function copyFolder(from, to, expected, label) {
  if (!existsSync(from)) {
    console.warn(`warning: no ${label} folder at ${from}; the site is built without ${label}.`);
    return;
  }
  // Only picture files: the folders also hold a README that must not end up on the site.
  const names = readdirSync(from, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && /\.(ico|svg|png|jpe?g|webp)$/i.test(entry.name))
    .map((entry) => entry.name);
  for (const name of expected) if (!names.includes(name)) console.warn(`warning: ${label} file ${name} is missing in ${from}.`);
  mkdirSync(to, { recursive: true });
  for (const name of names) cpSync(join(from, name), join(to, name));
}

// The newest (by published_at) tauri-test-N release that carries a Windows setup asset; returns { release, asset }.
export function pickInstaller(releases) {
  const candidates = (Array.isArray(releases) ? releases : [])
    .filter((release) => String(release?.tag_name ?? "").startsWith("tauri-test-"))
    .map((release) => ({ release, asset: (release.assets ?? []).find((a) => String(a?.name ?? "").endsWith("-Windows-setup.exe")) }))
    .filter((entry) => entry.asset)
    .sort((a, b) => Date.parse(b.release.published_at ?? 0) - Date.parse(a.release.published_at ?? 0));
  if (!candidates.length) throw new Error("No tauri-test release with a Windows installer was found on GitHub.");
  return candidates[0];
}

// 2414270 → "2.3 MB" (one decimal, always MB).
export function formatSize(bytes) {
  return `${(Number(bytes) / (1024 * 1024)).toFixed(1)} MB`;
}

// download/latest.json: the { version, notes, url } shape of the desktop update check (D-023), plus size and checksum.
// info.version is the preview version ("1.65"); the file carries the app version ("1.65.0").
export function latestJson(info) {
  return {
    version: appVersionFrom(info.version),
    notes: [...(info.notes ?? [])],
    url: `${siteUrl}/${installerPath}`,
    size: info.size,
    sha256: info.sha256,
    updatedAt: info.updatedAt,
  };
}

// kv-bulk.json for `wrangler kv bulk put`: one entry per file ({ key, bytes }), sorted by key, with the metadata
// { type, sha256, size } that worker.mjs uses for Content-Type, ETag and Content-Length.
export function bulkEntries(files) {
  return [...files]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ key, bytes }) => {
      const buffer = Buffer.from(bytes);
      return {
        key,
        value: buffer.toString("base64"),
        base64: true,
        metadata: { type: contentTypeFor(key), sha256: createHash("sha256").update(buffer).digest("hex"), size: buffer.length },
      };
    });
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function option(argv, name, fallback) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value.`);
  return value;
}

async function downloadInstaller() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "clipbox-website-build" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const list = await fetch(releasesApi, { headers });
  if (!list.ok) throw new Error(`GitHub releases could not be listed (HTTP ${list.status}). Set GITHUB_TOKEN or pass --installer.`);
  const { release, asset } = pickInstaller(await list.json());
  console.log(`installer ${release.tag_name} ${asset.name}`);
  const file = await fetch(asset.url, { headers: { ...headers, Accept: "application/octet-stream" } });
  if (!file.ok) throw new Error(`Installer download failed (HTTP ${file.status}).`);
  return Buffer.from(await file.arrayBuffer());
}

export async function main(argv = process.argv.slice(2)) {
  const preview = resolve(repo, option(argv, "--preview", "dist-preview"));
  const out = resolve(repo, option(argv, "--out", "dist-website"));
  const icons = resolve(repo, option(argv, "--icons", join(here, "icons")));
  const images = resolve(repo, option(argv, "--images", join(here, "images")));
  const installerArg = option(argv, "--installer", "");
  if (!existsSync(join(preview, "index.html"))) {
    console.error('Run "npm run preview:build" first.');
    process.exit(1);
  }

  const installer = installerArg ? readFileSync(resolve(repo, installerArg)) : await downloadInstaller();
  if (installer.length < 2 || installer[0] !== 0x4d || installer[1] !== 0x5a) throw new Error("The installer is not a Windows program (it does not start with MZ).");

  const version = readFileSync(join(previewDir, "VERSION"), "utf8").trim();
  const changelog = JSON.parse(readFileSync(join(previewDir, "changelog.json"), "utf8"));
  const info = previewBuildInfo(changelog, version);
  const updated = new Date(info.updatedAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const size = installer.length;
  const sha256 = createHash("sha256").update(installer).digest("hex");

  const css = readFileSync(join(here, "site.css"));
  const cssKey = cssAssetKey(css);
  const parts = Object.fromEntries(["head", "header", "footer"].map((name) => [name, readFileSync(join(here, `partials/${name}.html`), "utf8")]));
  const pageInfo = { version, updated, size: formatSize(size), sha256 };
  const extra = { CSS: `/${cssKey}` };
  const pages = sitePages.map((page) => ({
    key: page.key,
    html: assemblePage(page, { ...parts, body: readFileSync(join(here, page.source), "utf8") }, pageInfo, extra),
  }));
  const latest = latestJson({ version, notes: changelog?.[0]?.items ?? [], size, sha256, updatedAt: info.updatedAt });

  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "download"), { recursive: true });
  for (const page of pages) {
    mkdirSync(dirname(join(out, page.key)), { recursive: true });
    writeFileSync(join(out, page.key), page.html);
  }
  mkdirSync(join(out, "assets"), { recursive: true });
  writeFileSync(join(out, cssKey), css);
  copyFolder(icons, out, iconFiles, "icons");
  copyFolder(images, join(out, "images"), imageFiles, "images");
  writeFileSync(join(out, "site.webmanifest"), JSON.stringify(webManifest(), null, 2) + "\n");
  writeFileSync(join(out, "robots.txt"), robotsTxt());
  writeFileSync(join(out, "sitemap.xml"), sitemapXml(updated));
  cpSync(preview, join(out, "preview"), { recursive: true });
  writeFileSync(join(out, installerPath), installer);
  writeFileSync(join(out, "download/latest.json"), JSON.stringify(latest, null, 2) + "\n");

  // The Worker serves these files from KV (see worker.mjs and deploy.mjs).
  const files = walk(out).map((path) => ({ key: relative(out, path).replaceAll("\\", "/"), bytes: readFileSync(path) }));
  const entries = bulkEntries(files);
  writeFileSync(join(out, "kv-bulk.json"), JSON.stringify(entries));
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ keys: entries.map((entry) => entry.key) }, null, 2) + "\n");

  console.log("out", out);
  console.log("version", latest.version);
  console.log("size", `${size} bytes (${formatSize(size)})`);
  console.log("sha256", sha256);
  console.log("css", cssKey);
  console.log("kv keys", entries.length);
  return { out, latest };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
