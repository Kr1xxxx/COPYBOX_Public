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
  formatSize,
  iconFiles,
  imageFiles,
  latestJson,
  main,
  pickInstaller,
  releaseVersionInfo,
  renderPage,
  robotsTxt,
  sitemapXml,
  sitePages,
  versionAssetName,
} from "../tools/website/build.mjs";
import { parseKeyList, staleKeys } from "../tools/website/deploy.mjs";
import { appVersionFrom } from "../scripts/sync-version.mjs";

// The app version a local installer is declared to carry (D-048): the checkout's preview number, so the fake
// installer below matches the changelog entry the build looks up.
const localInstallerVersion = appVersionFrom(readFileSync("tools/preview/VERSION", "utf8"));

const pageKeys = ["index.html", "download/index.html", "help/index.html", "privacy/index.html"];
const allPageKeys = [...pageKeys, "404.html"];

// Builds into a temp dir with a fake installer. Placeholder icons and screenshots are written unless
// `assets` is false, in which case --icons and --images point at folders that do not exist.
async function buildSite({ assets = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "clipbox-website-"));
  const installer = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(4096, 7)]);
  writeFileSync(join(dir, "setup.exe"), installer);
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
    await main(["--installer", join(dir, "setup.exe"), "--installer-version", localInstallerVersion, "--out", out, "--icons", icons, "--images", images]);
  } finally {
    console.log = log;
    console.warn = warn;
  }
  const read = (key) => readFileSync(join(out, key), "utf8");
  return { dir, out, installer, warnings, read };
}

let site;
before(async () => {
  site = await buildSite();
});
after(() => {
  if (site) rmSync(site.dir, { recursive: true, force: true });
});

test("website page: placeholders are filled in one pass, a leftover one throws", () => {
  const html = renderPage("<p>v__VERSION__ · __SIZE__ · 更新于 __UPDATED__</p><i>__VERSION__</i>", {
    version: "1.65\n",
    updated: "2026-10-13",
    size: "2.3 MB",
  });
  assert.equal(html, "<p>v1.65 · 2.3 MB · 更新于 2026-10-13</p><i>1.65</i>");
  assert.throws(() => renderPage("__VERSION__ __COLOR__", { version: "1.65", updated: "x", size: "y" }), /__COLOR__/);
  assert.throws(() => renderPage("__SHA256__", { version: "1.65", updated: "x", size: "y" }), /__SHA256__/);
  assert.equal(renderPage("__SHA256__ __NAV_HOME__", { version: "1", updated: "x", size: "y", sha256: "ab" }, { NAV_HOME: "" }), "ab ");
  // Filled-in text is not scanned again, and kept names stay for the Worker.
  assert.equal(renderPage("__A__", { version: "1", updated: "x", size: "y" }, { A: "__SIZE__" }), "__SIZE__");
  assert.equal(renderPage("<p>__MESSAGE__</p>", { version: "1", updated: "x", size: "y" }, {}, ["MESSAGE"]), "<p>__MESSAGE__</p>");
});

test("website pages: head, header, body and footer are joined and the current nav item is marked", () => {
  const parts = { head: "<title>__PAGE_TITLE__</title>__ROBOTS__", header: '<a href="/"__NAV_HOME__>首页</a><a href="/help/"__NAV_HELP__>使用说明</a>__NAV_DOWNLOAD__', body: "<p>__CSS__</p>", footer: "<i>__CANONICAL__</i>" };
  const info = { version: "1.67", updated: "2026-10-13", size: "1.0 MB" };
  const help = sitePages.find((page) => page.key === "help/index.html");
  assert.equal(
    assemblePage(help, parts, info, { CSS: "/assets/site.x.css" }),
    '<title>使用说明 · Copyboxx</title><a href="/">首页</a><a href="/help/" aria-current="page">使用说明</a><p>/assets/site.x.css</p><i>https://copyboxx.com/help/</i>',
  );
  const notFound = sitePages.find((page) => page.key === "404.html");
  assert.match(assemblePage(notFound, parts, info, { CSS: "" }), /<meta name="robots" content="noindex">/);
  assert.throws(() => assemblePage(help, { ...parts, body: "__NAV_UPDATES__" }, info, { CSS: "" }), /__NAV_UPDATES__/);
  assert.match(cssAssetKey("body{}"), /^assets\/site\.[0-9a-f]{8}\.css$/);
  assert.notEqual(cssAssetKey("body{}"), cssAssetKey("body{ }"));
});

test("website build writes every page, the stylesheet, icons, images, installer and latest.json, and no web preview", () => {
  const { out, installer, read, warnings } = site;
  assert.deepEqual(warnings, []);
  const home = read("index.html");
  assert.match(home, /href="\/download\/Copyboxx-Setup\.exe"/);
  assert.ok(!existsSync(join(out, "preview")));
  for (const key of allPageKeys) assert.doesNotMatch(read(key), /\/preview\/|在线试用|口令/, key);
  assert.deepEqual(readFileSync(join(out, "download/Copyboxx-Setup.exe")), installer);
  for (const name of iconFiles) assert.equal(read(name), `icon ${name}`);
  for (const name of imageFiles) assert.equal(read(`images/${name}`), `image ${name}`);
  const latest = JSON.parse(read("download/latest.json"));
  assert.match(latest.version, /^\d+\.\d+\.0$/);
  assert.equal(latest.url, "https://copyboxx.com/download/Copyboxx-Setup.exe");
  assert.equal(latest.size, installer.length);
  assert.equal(latest.sha256, createHash("sha256").update(installer).digest("hex"));
  assert.ok(Array.isArray(latest.notes) && latest.notes.length > 0);

  const css = readFileSync("tools/website/site.css");
  const cssKey = cssAssetKey(css);
  assert.deepEqual(readFileSync(join(out, cssKey)), css);

  const bulk = JSON.parse(read("kv-bulk.json"));
  const keys = bulk.map((entry) => entry.key);
  assert.deepEqual(keys, [
    "404.html",
    "apple-touch-icon.png",
    cssKey,
    "download/Copyboxx-Setup.exe",
    "download/index.html",
    "download/latest.json",
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
  assert.equal(bulk.find((entry) => entry.key === "download/Copyboxx-Setup.exe").metadata.type, "application/x-msdownload");
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
    assert.deepEqual([...nav.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]), ["/", "/download/", "/help/"], key);
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
    assert.match(html, /Copyboxx · v\d+\.\d+ · 更新于 \d{4}-\d{2}-\d{2} · 数据只保存在你的电脑上/, key);
    assert.equal(html.includes('<meta name="robots" content="noindex">'), Boolean(page.noindex), key);
  }
});

test("website pages: the current nav item is marked, and only that one", () => {
  const expected = {
    "index.html": "/",
    "download/index.html": "/download/",
    "help/index.html": "/help/",
    "privacy/index.html": null,
    "404.html": null,
  };
  for (const [key, href] of Object.entries(expected)) {
    const marked = [...site.read(key).matchAll(/<a href="([^"]*)" aria-current="page">/g)].map((m) => m[1]);
    assert.deepEqual(marked, href ? [href] : [], key);
  }
});

test("website pages: Chinese, fixed security line, no eyebrow labels, no http:// and no outside resources", () => {
  const home = site.read("index.html");
  assert.ok(home.includes("内容用 AES-256 加密，只保存在这台设备上"));
  assert.ok(home.includes("常用话术、账号资料、"));
  for (const key of allPageKeys) {
    const html = site.read(key);
    assert.deepEqual([...html.matchAll(/>\s*([A-Z][A-Z ]{5,})\s*</g)].map((m) => m[1]), [], key);
    assert.doesNotMatch(html, /http:\/\//, key);
    // Every src/href stays on the site, except the absolute share-card links in <head>.
    const outside = [...html.matchAll(/(?:src|href)="([^"]*)"/g)].map((m) => m[1]).filter((link) => !link.startsWith("/") && !link.startsWith("#"));
    assert.deepEqual(outside.filter((link) => !link.startsWith("https://copyboxx.com/")), [], key);
    assert.equal([...html.matchAll(/<script/g)].length, 1, key);
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

test("website download page shows the version, size, date and sha256", () => {
  const html = site.read("download/index.html");
  const latest = JSON.parse(site.read("download/latest.json"));
  const version = readFileSync("tools/preview/VERSION", "utf8").trim();
  assert.ok(html.includes(`v${version} · ${formatSize(latest.size)} · 更新于 `));
  assert.ok(html.includes(`<code>${latest.sha256}</code>`));
  assert.match(html, /<a class="pill" href="\/download\/Copyboxx-Setup\.exe">/);
  for (const id of ["install", "smartscreen", "move", "update", "mac"]) assert.ok(html.includes(`id="${id}"`), id);
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
  assert.deepEqual(urls, ["/", "/download/", "/help/", "/privacy/"].map((path) => `https://copyboxx.com${path}`));
  const updated = JSON.parse(site.read("download/latest.json")).updatedAt.slice(0, 10);
  assert.equal(sitemap.match(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/g).length, 4);
  assert.ok(sitemap.includes(`<lastmod>${updated}</lastmod>`));
  assert.equal(sitemapXml("2026-10-13"), sitemap.replaceAll(updated, "2026-10-13"));

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

test("website installer: the newest tauri-test release with a Windows asset wins", () => {
  const win = (name) => ({ name, url: `https://api.github.com/assets/${name}` });
  const releases = [
    { tag_name: "tauri-test-93", published_at: "2026-10-13T12:00:00Z", assets: [win("Clipboxx-Tauri-test-macOS.dmg")] },
    { tag_name: "v2.0.0", published_at: "2026-10-13T13:00:00Z", assets: [win("Clipbox-Windows-setup.exe")] },
    { tag_name: "tauri-test-91", published_at: "2026-10-11T09:00:00Z", assets: [win("Clipbox-Tauri-test-Windows-setup.exe")] },
    { tag_name: "tauri-test-92", published_at: "2026-10-12T09:00:00Z", assets: [win("Clipboxx-Tauri-test-Windows-setup.exe")] },
  ];
  const { release, asset, versionAsset } = pickInstaller(releases);
  assert.equal(release.tag_name, "tauri-test-92");
  assert.equal(asset.name, "Clipboxx-Tauri-test-Windows-setup.exe");
  assert.equal(versionAsset, undefined, "older releases carry no version file");
  // D-046: release assets are now Copyboxx-Windows-setup.exe; the newest release still wins whatever its name.
  // D-048: it also carries release-version.json, which the build reads for the version it advertises.
  const renamed = { tag_name: "tauri-test-94", published_at: "2026-10-14T09:00:00Z", assets: [win("Copyboxx-macOS-arm64.zip"), win("Copyboxx-Windows-setup.exe"), win(versionAssetName)] };
  const newest = pickInstaller([...releases, renamed]);
  assert.equal(newest.asset.name, "Copyboxx-Windows-setup.exe");
  assert.equal(newest.versionAsset.name, "release-version.json");
  assert.throws(() => pickInstaller([releases[0], releases[1]]), /No tauri-test release/);
  assert.throws(() => pickInstaller([]), /No tauri-test release/);
});

test("website release-version.json: the installer's own version, built from main, or the build stops (D-048)", () => {
  const good = { version: "1.67.0", preview: "1.67", ref: "main", commit: "abc123" };
  assert.deepEqual(releaseVersionInfo(good, "tauri-test-120"), good);
  // The preview number can be left out: it is the app version without the last part.
  assert.deepEqual(releaseVersionInfo({ version: "1.70.0", ref: "main" }), { version: "1.70.0", preview: "1.70", ref: "main", commit: "" });
  assert.throws(() => releaseVersionInfo({ version: "1.67", ref: "main" }, "tauri-test-120"), /tauri-test-120: release-version\.json has no app version like 1\.67\.0/);
  assert.throws(() => releaseVersionInfo({ ref: "main" }), /no app version/);
  assert.throws(() => releaseVersionInfo(null), /no app version/);
  assert.throws(() => releaseVersionInfo({ version: "1.67.0", ref: "auto-update" }, "tauri-test-121"), /tauri-test-121 was built from "auto-update", not from main/);
  assert.throws(() => releaseVersionInfo({ version: "1.67.0" }), /was built from "\?", not from main/);
  assert.throws(() => releaseVersionInfo({ version: "1.67.0", preview: "1.68", ref: "main" }), /preview 1\.68 and app version 1\.67\.0 do not match/);
});

test("website installer size is shown in MB with one decimal", () => {
  assert.equal(formatSize(2414270), "2.3 MB");
  assert.equal(formatSize(1048576), "1.0 MB");
  assert.equal(formatSize(52428800), "50.0 MB");
});

test("website latest.json has the update-check shape plus size and checksum", () => {
  const latest = latestJson({ version: "1.65", notes: ["一", "二"], size: 10, sha256: "ab", updatedAt: "2026-10-13T19:56:00+08:00" });
  assert.deepEqual(latest, {
    version: "1.65.0",
    notes: ["一", "二"],
    url: "https://copyboxx.com/download/Copyboxx-Setup.exe",
    size: 10,
    sha256: "ab",
    updatedAt: "2026-10-13T19:56:00+08:00",
  });
  // The installer's own app version is taken as it is (D-048); anything that is not a version stops the build.
  assert.equal(latestJson({ version: "1.70.0", size: 1, sha256: "a", updatedAt: "x" }).version, "1.70.0");
  assert.throws(() => latestJson({ version: "latest", size: 1, sha256: "a", updatedAt: "x" }), /needs an app version like 1\.67\.0/);
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

test("website build refuses a file that is not a Windows program", async () => {
  const dir = mkdtempSync(join(tmpdir(), "clipbox-website-"));
  try {
    writeFileSync(join(dir, "setup.exe"), "not a program");
    await assert.rejects(main(["--installer", join(dir, "setup.exe"), "--out", join(dir, "out")]), /MZ/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
