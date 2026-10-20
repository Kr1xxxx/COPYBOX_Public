// Builds the public website for copyboxx.com (see README.md):
//   node tools/website/build.mjs [--out <dir>] [--icons <dir>] [--images <dir>]
// Defaults: --out dist-website (relative to the repo root), --icons tools/website/icons,
// --images tools/website/images. The site hosts no public installer any more (owner, 2026-10-20, D-089): the download
// buttons lead to the inquiry form at /contact/, and the Worker mails each inquiry to the owner.
// Every page is partials/head.html + partials/header.html (current nav item marked) + its body + partials/footer.html;
// the stylesheet becomes assets/site.<hash>.css. Besides the site files it writes kv-bulk.json and manifest.json,
// which deploy.mjs uploads to KV for worker.mjs.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { previewBuildInfo } from "../preview/build.mjs";
import { contentTypeFor } from "./worker.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const previewDir = join(repo, "tools/preview");

export const siteUrl = "https://copyboxx.com";

const placeholder = /__([A-Z0-9]+(?:_[A-Z0-9]+)*)__/g;

// Fills the `values` ({ PAGE_TITLE: "…" } fills __PAGE_TITLE__) in one pass, so filled-in text is never scanned
// again. A placeholder without a value throws (the template and this build disagree), except the names in `keep`,
// which stay for the Worker to fill in.
export function renderPage(template, values = {}, keep = []) {
  const missing = [];
  const html = template.replace(placeholder, (match, name) => {
    if (Object.hasOwn(values, name)) return String(values[name]);
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
// text. 404.html is left out of the sitemap and carries noindex.
export const sitePages = [
  { source: "pages/index.html", key: "index.html", path: "/", nav: "HOME", title: "Copyboxx · 复制盒",
    description: "Copyboxx（复制盒）把常用话术、账号资料和图片存在自己电脑上，点一下就复制。不用注册，断网也能用，内容加密保存。" },
  // The inquiry form (D-089): the public installer is no longer on the site, interested people write to the owner.
  { source: "pages/contact.html", key: "contact/index.html", path: "/contact/", nav: "CONTACT", title: "联系我们 · Copyboxx",
    description: "想用 Copyboxx（复制盒）？留下邮箱和需求，我们会尽快回复。" },
  { source: "pages/help.html", key: "help/index.html", path: "/help/", nav: "HELP", title: "使用说明 · Copyboxx",
    description: "Copyboxx（复制盒）怎么用：话术、账号、图片、托盘小窗、备份与恢复、公司共享话术、AI 润色和整理。" },
  { source: "pages/privacy.html", key: "privacy/index.html", path: "/privacy/", nav: "", title: "隐私说明 · Copyboxx",
    description: "Copyboxx（复制盒）不收集你的内容：没有账号，没有服务器，数据加密后只保存在你的电脑上。" },
  // Staff installers behind the company password (D-080): not in the nav, not in the sitemap.
  { source: "pages/staff.html", key: "staff/index.html", path: "/staff/", nav: "", title: "内部版下载 · Copyboxx",
    description: "公司内部版本，验证密码后下载。", noindex: true },
  { source: "404.html", key: "404.html", path: "/", nav: "", title: "找不到这个页面 · Copyboxx",
    description: "找不到这个页面。", noindex: true },
];
const navItems = ["HOME", "CONTACT", "HELP"];

// One page: head + header (its nav item gets aria-current="page") + body + footer, every placeholder filled.
// parts: { head, header, body, footer }; extra: more values such as { CSS }.
export function assemblePage(page, parts, extra = {}) {
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
  return renderPage(template, values, page.keep ?? []);
}

// assets/site.<first 8 hex of the sha256>.css: a changed stylesheet gets a new name, so it can be cached for good.
export function cssAssetKey(css) {
  return `assets/site.${createHash("sha256").update(css).digest("hex").slice(0, 8)}.css`;
}

// Made by hand with make-icons.mjs and make-screenshots.mjs; the build only warns when one is missing.
export const iconFiles = ["favicon.ico", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "og-image.png", "wordmark-cn.svg", "wordmark.svg"];
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
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
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

export async function main(argv = process.argv.slice(2)) {
  const out = resolve(repo, option(argv, "--out", "dist-website"));
  const icons = resolve(repo, option(argv, "--icons", join(here, "icons")));
  const images = resolve(repo, option(argv, "--images", join(here, "images")));
  // The preview number of this checkout (tools/preview/VERSION) only dates the sitemap now.
  const version = readFileSync(join(previewDir, "VERSION"), "utf8").trim();
  const changelog = JSON.parse(readFileSync(join(previewDir, "changelog.json"), "utf8"));
  const info = previewBuildInfo(changelog, version);
  const updated = new Date(info.updatedAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });

  const css = readFileSync(join(here, "site.css"));
  const cssKey = cssAssetKey(css);
  const parts = Object.fromEntries(["head", "header", "footer"].map((name) => [name, readFileSync(join(here, `partials/${name}.html`), "utf8")]));
  const extra = { CSS: `/${cssKey}` };
  const pages = sitePages.map((page) => ({
    key: page.key,
    html: assemblePage(page, { ...parts, body: readFileSync(join(here, page.source), "utf8") }, extra),
  }));

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
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

  // The Worker serves these files from KV (see worker.mjs and deploy.mjs).
  const files = walk(out).map((path) => ({ key: relative(out, path).replaceAll("\\", "/"), bytes: readFileSync(path) }));
  const entries = bulkEntries(files);
  writeFileSync(join(out, "kv-bulk.json"), JSON.stringify(entries));
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ keys: entries.map((entry) => entry.key) }, null, 2) + "\n");

  console.log("out", out);
  console.log("css", cssKey);
  console.log("kv keys", entries.length);
  return { out };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
