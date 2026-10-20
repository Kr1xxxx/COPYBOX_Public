import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
  assemblePage,
  bulkEntries,
  cssAssetKey,
  iconFiles,
  imageFiles,
  main,
  renderPage,
  robotsTxt,
  sitemapXml,
  sitePages,
} from "../tools/website/build.mjs";
import { parseKeyList, staleKeys } from "../tools/website/deploy.mjs";

const pageKeys = ["index.html", "contact/index.html", "help/index.html", "privacy/index.html"];
const allPageKeys = [...pageKeys, "404.html"];
// The inquiry form's Turnstile script (D-089): the one resource the site loads from outside.
const turnstileScript = "https://challenges.cloudflare.com/turnstile/v0/api.js";

// Builds into a temp dir. Placeholder icons and screenshots are written unless `assets` is false, in which case
// --icons and --images point at folders that do not exist.
async function buildSite({ assets = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "clipbox-website-"));
  const icons = join(dir, "icons");
  const images = join(dir, "images");
  if (assets) {
    mkdirSync(icons);
    mkdirSync(images);
    for (const name of iconFiles) writeFileSync(join(icons, name), `icon ${name}`);
    for (const name of imageFiles) writeFileSync(join(images, name), `image ${name}`);
  }
  const out = join(dir, "out");
  const warnings = [];
  const { log, warn } = console;
  console.log = () => {};
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    await main(["--out", out, "--icons", icons, "--images", images]);
  } finally {
    console.log = log;
    console.warn = warn;
  }
  const read = (key) => readFileSync(join(out, key), "utf8");
  return { dir, out, warnings, read };
}

let site;
before(async () => {
  site = await buildSite();
});
after(() => {
  if (site) rmSync(site.dir, { recursive: true, force: true });
});

test("website page: placeholders are filled in one pass, a leftover one throws", () => {
  const html = renderPage("<p>__PAGE_TITLE__ · __CSS__</p><i>__PAGE_TITLE__</i>", { PAGE_TITLE: "下载", CSS: "/a.css" });
  assert.equal(html, "<p>下载 · /a.css</p><i>下载</i>");
  assert.throws(() => renderPage("__CSS__ __COLOR__", { CSS: "x" }), /__COLOR__/);
  assert.equal(renderPage("__SHA256__ __NAV_HOME__", { SHA256: "ab", NAV_HOME: "" }), "ab ");
  // Filled-in text is not scanned again, and kept names stay for the Worker.
  assert.equal(renderPage("__A__", { A: "__SIZE__" }), "__SIZE__");
  assert.equal(renderPage("<p>__MESSAGE__</p>", {}, ["MESSAGE"]), "<p>__MESSAGE__</p>");
});

test("website pages: head, header, body and footer are joined and the current nav item is marked", () => {
  const parts = { head: "<title>__PAGE_TITLE__</title>__ROBOTS__", header: '<a href="/"__NAV_HOME__>首页</a><a href="/help/"__NAV_HELP__>使用说明</a>__NAV_CONTACT__', body: "<p>__CSS__</p>", footer: "<i>__CANONICAL__</i>" };
  const help = sitePages.find((page) => page.key === "help/index.html");
  assert.equal(
    assemblePage(help, parts, { CSS: "/assets/site.x.css" }),
    '<title>使用说明 · Copyboxx</title><a href="/">首页</a><a href="/help/" aria-current="page">使用说明</a><p>/assets/site.x.css</p><i>https://copyboxx.com/help/</i>',
  );
  const notFound = sitePages.find((page) => page.key === "404.html");
  assert.match(assemblePage(notFound, parts, { CSS: "" }), /<meta name="robots" content="noindex">/);
  assert.throws(() => assemblePage(help, { ...parts, body: "__NAV_UPDATES__" }, { CSS: "" }), /__NAV_UPDATES__/);
  assert.match(cssAssetKey("body{}"), /^assets\/site\.[0-9a-f]{8}\.css$/);
  assert.notEqual(cssAssetKey("body{}"), cssAssetKey("body{ }"));
});

test("website build writes every page, the stylesheet, icons and images; no installer, no latest.json, no web preview (D-089)", () => {
  const { out, read, warnings } = site;
  assert.deepEqual(warnings, []);
  const home = read("index.html");
  assert.match(home, /<a class="pill" href="\/contact\/">联系我们 →<\/a>/);
  assert.ok(!existsSync(join(out, "preview")));
  assert.ok(!existsSync(join(out, "download")));
  for (const key of allPageKeys) assert.doesNotMatch(read(key), /\/preview\/|在线试用|口令|\/download\/|Copyboxx-Setup\.exe/, key);
  for (const name of iconFiles) assert.equal(read(name), `icon ${name}`);
  for (const name of imageFiles) assert.equal(read(`images/${name}`), `image ${name}`);

  const css = readFileSync("tools/website/site.css");
  const cssKey = cssAssetKey(css);
  assert.deepEqual(readFileSync(join(out, cssKey)), css);

  const bulk = JSON.parse(read("kv-bulk.json"));
  const keys = bulk.map((entry) => entry.key);
  assert.deepEqual(keys, [
    "404.html",
    "apple-touch-icon.png",
    cssKey,
    "contact/index.html",
    "favicon.ico",
    "favicon.svg",
    "help/index.html",
    "icon-192.png",
    "icon-512.png",
    "images/app-win-dark.png",
    "images/app-win-light.png",
    "index.html",
    "og-image.png",
    "privacy/index.html",
    "robots.txt",
    "site.webmanifest",
    "sitemap.xml",
    "staff/index.html",
    "wordmark-cn.svg",
    "wordmark.svg",
  ]);
  for (const entry of bulk) {
    const bytes = readFileSync(join(out, entry.key));
    assert.equal(entry.base64, true);
    assert.deepEqual(Buffer.from(entry.value, "base64"), bytes, entry.key);
    assert.equal(entry.metadata.size, bytes.length);
    assert.equal(entry.metadata.sha256, createHash("sha256").update(bytes).digest("hex"));
  }
  assert.equal(bulk.find((entry) => entry.key === cssKey).metadata.type, "text/css; charset=utf-8");
  assert.deepEqual(JSON.parse(read("manifest.json")), { keys });
});

test("website pages: no placeholder left, brand, nav, hashed stylesheet, canonical and share tags on every page", () => {
  const cssKey = cssAssetKey(readFileSync("tools/website/site.css"));
  for (const key of allPageKeys) {
    const html = site.read(key);
    const page = sitePages.find((entry) => entry.key === key);
    const left = html.match(/__[A-Z_]+__/g) ?? [];
    assert.deepEqual(left, [], key);
    assert.match(html, /^<!doctype html>\n<html lang="zh-CN">/, key);
    assert.ok(html.includes(`<title>${page.title}</title>`), key);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/, key);
    assert.match(html, /<a class="brand" href="\/"[^>]*><img src="\/favicon\.svg\?v=2"[^>]*><span class="wordmark" role="img" aria-label="Copyboxx 复制盒"><\/span><\/a>/, key);
    assert.match(html, /<nav class="nav" aria-label="网站导航">/, key);
    const nav = /<nav class="nav" aria-label="网站导航">([\s\S]*?)<\/nav>/.exec(html)[1];
    assert.deepEqual([...nav.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]), ["/", "/contact/", "/help/"], key);
    assert.doesNotMatch(nav, /更新记录/, key);
    assert.doesNotMatch(html, /\/updates\//, key);
    assert.ok(html.includes(`<link rel="stylesheet" href="/${cssKey}">`), key);
    assert.ok(html.includes(`<link rel="canonical" href="https://copyboxx.com${page.path}">`), key);
    assert.ok(html.includes(`<meta property="og:url" content="https://copyboxx.com${page.path}">`), key);
    assert.ok(html.includes('<meta property="og:image" content="https://copyboxx.com/og-image.png">'), key);
    assert.ok(html.includes(`<meta property="og:title" content="${page.title}">`), key);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/, key);
    assert.match(html, /<link rel="manifest" href="\/site\.webmanifest">/, key);
    assert.match(html, /<link rel="icon" href="\/favicon\.svg\?v=2" type="image\/svg\+xml">/, key);
    assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png\?v=2">/, key);
    assert.match(html, /clipboxx-site-theme/, key);
    assert.match(html, /data-theme-toggle aria-label="[^"]+"/, key);
    assert.match(html, /Copyboxx · 数据只保存在你的电脑上/, key);
    assert.doesNotMatch(html, /v\d+\.\d+ · /, key);
    assert.equal(html.includes('<meta name="robots" content="noindex">'), Boolean(page.noindex), key);
  }
});

test("website pages: the current nav item is marked, and only that one", () => {
  const expected = {
    "index.html": "/",
    "contact/index.html": "/contact/",
    "help/index.html": "/help/",
    "privacy/index.html": null,
    "404.html": null,
  };
  for (const [key, href] of Object.entries(expected)) {
    const marked = [...site.read(key).matchAll(/<a href="([^"]*)" aria-current="page">/g)].map((m) => m[1]);
    assert.deepEqual(marked, href ? [href] : [], key);
  }
});

test("website pages: Chinese, fixed security line, no eyebrow labels, no http://, nothing from outside but the Turnstile script", () => {
  const home = site.read("index.html");
  assert.ok(home.includes("内容用 AES-256 加密，只保存在这台设备上"));
  assert.ok(home.includes("常用话术、账号资料、"));
  for (const key of allPageKeys) {
    const html = site.read(key);
    assert.deepEqual([...html.matchAll(/>\s*([A-Z][A-Z ]{5,})\s*</g)].map((m) => m[1]), [], key);
    assert.doesNotMatch(html, /http:\/\//, key);
    // Every src/href stays on the site, except the absolute share-card links in <head> and, on the inquiry page
    // only, Cloudflare's Turnstile script (D-089).
    const outside = [...html.matchAll(/(?:src|href)="([^"]*)"/g)].map((m) => m[1]).filter((link) => !link.startsWith("/") && !link.startsWith("#"));
    const contact = key === "contact/index.html";
    assert.deepEqual(outside.filter((link) => !link.startsWith("https://copyboxx.com/")), contact ? [turnstileScript] : [], key);
    assert.equal([...html.matchAll(/<script/g)].length, contact ? 3 : key === "staff/index.html" ? 2 : 1, key);
  }
});

test("website pages: every link inside the site points at a built file", () => {
  for (const key of allPageKeys) {
    const html = site.read(key);
    for (const [, link] of html.matchAll(/(?:src|href)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
      const target = link === "/" ? "index.html" : link.endsWith("/") ? `${link.slice(1)}index.html` : link.slice(1);
      assert.ok(existsSync(join(site.out, target)), `${key} → ${link}`);
    }
    for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${id}"`), `${key} #${id}`);
  }
});

test("website inquiry page (D-089): form posts to /contact/send, carries the Turnstile widget, 发送 waits for it", () => {
  const html = site.read("contact/index.html");
  assert.match(html, /<form class="card solo-card staff-form contact-form" id="contact-form" method="post" action="\/contact\/send">/);
  for (const name of ["name", "email", "company", "message"]) assert.ok(html.includes(`name="${name}"`), name);
  assert.match(html, /<div class="cf-turnstile contact-turnstile" data-sitekey="0x4AAAAAAFbunVqZ_GEl5V7v" data-callback="contactVerified"/);
  assert.ok(html.includes(`<script src="${turnstileScript}" async defer></script>`));
  assert.match(html, /<button class="pill staff-verify" type="submit" disabled>/);
  for (const id of ["captcha", "bad", "failed", "limit", "sent"]) assert.ok(html.includes(`id="${id}"`), id);
  assert.doesNotMatch(html, /下载/);
});

test("website help page is a short overview: eight sections, then 常见问题, no sub-sections", () => {
  const html = site.read("help/index.html");
  const main = /<main id="main">([\s\S]*)<\/main>/.exec(html)[1];
  const headings = [...main.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)].map((m) => m[2]);
  assert.deepEqual(headings, ["话术", "账号", "图片", "托盘小窗", "备份与恢复", "公司共享话术", "AI 润色和整理", "设置", "常见问题"]);
  assert.doesNotMatch(main, /<h3/);
  assert.doesNotMatch(main, /<ol/);
  assert.equal(main.match(/<a href="#[^"]+">/g).length, 9);
  assert.equal(main.match(/<details>/g).length, 5);
  const bodies = [...main.matchAll(/<\/h2>\n\s*<p>([^<]+)<\/p>\n\s*<\/section>/g)].map((m) => m[1]);
  assert.equal(bodies.length, 8);
  for (const body of bodies) {
    const sentences = body.split("。").filter(Boolean).length;
    assert.ok(sentences >= 2 && sentences <= 3, body);
  }
});

test("website search-engine files: sitemap, robots.txt and the web manifest", () => {
  const sitemap = site.read("sitemap.xml");
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(urls, ["/", "/contact/", "/help/", "/privacy/"].map((path) => `https://copyboxx.com${path}`));
  const dates = [...sitemap.matchAll(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/g)].map((m) => m[1]);
  assert.equal(dates.length, 4);
  assert.equal(sitemapXml("2026-10-13"), sitemap.replaceAll(dates[0], "2026-10-13"));

  const robots = site.read("robots.txt");
  assert.equal(robots, robotsTxt());
  assert.match(robots, /^User-agent: \*$/m);
  assert.doesNotMatch(robots, /Disallow/);
  assert.match(robots, /^Sitemap: https:\/\/copyboxx\.com\/sitemap\.xml$/m);

  const manifest = JSON.parse(site.read("site.webmanifest"));
  assert.equal(manifest.short_name, "Copyboxx");
  assert.match(manifest.name, /Copyboxx/);
  assert.equal(manifest.lang, "zh-CN");
  assert.deepEqual(manifest.icons.map((icon) => [icon.src, icon.sizes]), [["/icon-192.png", "192x192"], ["/icon-512.png", "512x512"]]);
  assert.equal(manifest.theme_color, "#f8fafc");
});

test("website build only warns when the icons or images folder is missing", async () => {
  const bare = await buildSite({ assets: false });
  try {
    assert.equal(bare.warnings.length, 2);
    assert.match(bare.warnings[0], /icons/);
    assert.match(bare.warnings[1], /images/);
    assert.ok(existsSync(join(bare.out, "index.html")));
    assert.ok(!existsSync(join(bare.out, "favicon.ico")));
    assert.ok(!existsSync(join(bare.out, "images")));
  } finally {
    rmSync(bare.dir, { recursive: true, force: true });
  }
});

test("website 404 page", () => {
  const notFound = site.read("404.html");
  assert.match(notFound, /找不到这个页面/);
  assert.match(notFound, /<a class="pill" href="\/">回到首页<\/a>/);
});

test("website KV entries: sorted, base64 values, type, checksum and size", () => {
  const exe = Buffer.from([0x4d, 0x5a, 0, 255]);
  const entries = bulkEntries([
    { key: "preview/index.html", bytes: Buffer.from("<p>hi</p>") },
    { key: "download/Copyboxx-Setup.exe", bytes: exe },
  ]);
  assert.deepEqual(entries, [
    {
      key: "download/Copyboxx-Setup.exe",
      value: "TVoA/w==",
      base64: true,
      metadata: { type: "application/x-msdownload", sha256: createHash("sha256").update(exe).digest("hex"), size: 4 },
    },
    {
      key: "preview/index.html",
      value: Buffer.from("<p>hi</p>").toString("base64"),
      base64: true,
      metadata: { type: "text/html; charset=utf-8", sha256: createHash("sha256").update("<p>hi</p>").digest("hex"), size: 9 },
    },
  ]);
});

test("website deploy: keys no longer in the build are removed, the key list is read past warnings", () => {
  assert.deepEqual(staleKeys(["index.html", "preview/assets/static/old.js", "a.txt", "a.txt"], ["index.html", "404.html"]), [
    "a.txt",
    "preview/assets/static/old.js",
  ]);
  assert.deepEqual(staleKeys(["index.html"], ["index.html"]), []);
  assert.deepEqual(staleKeys(["index.html", "sync/XS-AAAA0000/snippets.json", "sync/XS-AAAA0000/history/snippets-1.json"], ["index.html"]), []);
  assert.deepEqual(staleKeys(["index.html", "domains/company.com", "domains/shop.example.cn"], ["index.html"]), []);
  assert.deepEqual(staleKeys(["index.html", "download/private-abc123/latest.json", "download/private-abc123/Copyboxx-Setup.exe"], ["index.html"]), []);
  assert.deepEqual(staleKeys(["download/old.exe", "download/privatex.json"], ["index.html"]), ["download/old.exe", "download/privatex.json"]);
  assert.deepEqual(parseKeyList('▲ [WARNING] Proxy environment variables detected.\nResource location: remote\n[{"name":"index.html"},{"name":"404.html","metadata":{}}]\n'), ["index.html", "404.html"]);
  assert.throws(() => parseKeyList("nothing"), /key list/);
});
