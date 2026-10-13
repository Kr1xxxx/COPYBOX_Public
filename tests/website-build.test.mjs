import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatSize, latestJson, main, pickInstaller, renderPage } from "../tools/website/build.mjs";

test("website page: placeholders are filled, a leftover one throws", () => {
  const html = renderPage("<p>v__VERSION__ · __SIZE__ · 更新于 __UPDATED__</p><i>__VERSION__</i>", {
    version: "1.65\n",
    updated: "2026-10-13",
    size: "2.3 MB",
  });
  assert.equal(html, "<p>v1.65 · 2.3 MB · 更新于 2026-10-13</p><i>1.65</i>");
  assert.throws(() => renderPage("__VERSION__ __COLOR__", { version: "1.65", updated: "x", size: "y" }), /__COLOR__/);
});

test("website installer: the newest tauri-test release with a Windows asset wins", () => {
  const win = (name) => ({ name, url: `https://api.github.com/assets/${name}` });
  const releases = [
    { tag_name: "tauri-test-93", published_at: "2026-10-13T12:00:00Z", assets: [win("Clipboxx-Tauri-test-macOS.dmg")] },
    { tag_name: "v2.0.0", published_at: "2026-10-13T13:00:00Z", assets: [win("Clipbox-Windows-setup.exe")] },
    { tag_name: "tauri-test-91", published_at: "2026-10-11T09:00:00Z", assets: [win("Clipboxx-Tauri-test-Windows-setup.exe")] },
    { tag_name: "tauri-test-92", published_at: "2026-10-12T09:00:00Z", assets: [win("Clipboxx-Tauri-test-Windows-setup.exe")] },
  ];
  const { release, asset } = pickInstaller(releases);
  assert.equal(release.tag_name, "tauri-test-92");
  assert.equal(asset.name, "Clipboxx-Tauri-test-Windows-setup.exe");
  assert.throws(() => pickInstaller([releases[0], releases[1]]), /No tauri-test release/);
  assert.throws(() => pickInstaller([]), /No tauri-test release/);
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
    url: "https://copyboxx.com/download/Clipboxx-Setup.exe",
    size: 10,
    sha256: "ab",
    updatedAt: "2026-10-13T19:56:00+08:00",
  });
});

test("website build writes the page, 404, preview copy, installer and latest.json", async () => {
  const dir = mkdtempSync(join(tmpdir(), "clipbox-website-"));
  try {
    const preview = join(dir, "preview");
    mkdirSync(join(preview, "assets/static"), { recursive: true });
    writeFileSync(join(preview, "index.html"), "<title>preview</title>");
    writeFileSync(join(preview, "app-win.html"), "<title>app</title>");
    writeFileSync(join(preview, "assets/static/x.js"), "console.log(1);");
    const installer = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(4096, 7)]);
    writeFileSync(join(dir, "setup.exe"), installer);
    const out = join(dir, "out");

    const log = console.log;
    console.log = () => {};
    try {
      await main(["--installer", join(dir, "setup.exe"), "--preview", preview, "--out", out]);
    } finally {
      console.log = log;
    }

    const page = readFileSync(join(out, "index.html"), "utf8");
    assert.doesNotMatch(page, /__[A-Z]+__/);
    assert.match(page, /href="\/download\/Clipboxx-Setup\.exe"/);
    assert.match(page, /href="\/preview\/"/);
    assert.ok(existsSync(join(out, "404.html")));
    assert.equal(readFileSync(join(out, "preview/assets/static/x.js"), "utf8"), "console.log(1);");
    assert.equal(readFileSync(join(out, "preview/app-win.html"), "utf8"), "<title>app</title>");
    assert.deepEqual(readFileSync(join(out, "download/Clipboxx-Setup.exe")), installer);
    const latest = JSON.parse(readFileSync(join(out, "download/latest.json"), "utf8"));
    assert.match(latest.version, /^\d+\.\d+\.0$/);
    assert.equal(latest.url, "https://copyboxx.com/download/Clipboxx-Setup.exe");
    assert.equal(latest.size, installer.length);
    assert.equal(latest.sha256, createHash("sha256").update(installer).digest("hex"));
    assert.ok(Array.isArray(latest.notes) && latest.notes.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("website build refuses a file that is not a Windows program", async () => {
  const dir = mkdtempSync(join(tmpdir(), "clipbox-website-"));
  try {
    mkdirSync(join(dir, "preview"));
    writeFileSync(join(dir, "preview/index.html"), "x");
    writeFileSync(join(dir, "setup.exe"), "not a program");
    await assert.rejects(main(["--installer", join(dir, "setup.exe"), "--preview", join(dir, "preview"), "--out", join(dir, "out")]), /MZ/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("website page template: Chinese, fixed security line, no eyebrow labels, no outside resources", () => {
  const html = readFileSync("tools/website/index.html", "utf8");
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<title>Clipboxx · 复制盒<\/title>/);
  assert.ok(html.includes("内容用 AES-256 加密，只保存在这台设备上"));
  assert.deepEqual([...html.matchAll(/>\s*([A-Z][A-Z ]{5,})\s*</g)].map((m) => m[1]), []);
  const links = [...html.matchAll(/(?:src|href)="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(links)].sort(), ["/download/Clipboxx-Setup.exe", "/preview/"]);
  assert.doesNotMatch(html, /<script/);
  const notFound = readFileSync("tools/website/404.html", "utf8");
  assert.match(notFound, /找不到这个页面/);
  assert.match(notFound, /href="\/"/);
  assert.doesNotMatch(notFound, /__[A-Z]+__/);
});
