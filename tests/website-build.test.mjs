import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bulkEntries, formatSize, latestJson, main, pickInstaller, renderPage } from "../tools/website/build.mjs";
import { parseKeyList, staleKeys } from "../tools/website/deploy.mjs";

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
    assert.equal(readFileSync(join(out, "preview-gate.html"), "utf8"), readFileSync("tools/website/preview-gate.html", "utf8"));
    assert.equal(readFileSync(join(out, "preview/assets/static/x.js"), "utf8"), "console.log(1);");
    assert.equal(readFileSync(join(out, "preview/app-win.html"), "utf8"), "<title>app</title>");
    assert.deepEqual(readFileSync(join(out, "download/Clipboxx-Setup.exe")), installer);
    const latest = JSON.parse(readFileSync(join(out, "download/latest.json"), "utf8"));
    assert.match(latest.version, /^\d+\.\d+\.0$/);
    assert.equal(latest.url, "https://copyboxx.com/download/Clipboxx-Setup.exe");
    assert.equal(latest.size, installer.length);
    assert.equal(latest.sha256, createHash("sha256").update(installer).digest("hex"));
    assert.ok(Array.isArray(latest.notes) && latest.notes.length > 0);

    const bulk = JSON.parse(readFileSync(join(out, "kv-bulk.json"), "utf8"));
    const keys = bulk.map((entry) => entry.key);
    assert.deepEqual(keys, [
      "404.html",
      "download/Clipboxx-Setup.exe",
      "download/latest.json",
      "index.html",
      "preview-gate.html",
      "preview/app-win.html",
      "preview/assets/static/x.js",
      "preview/index.html",
    ]);
    for (const entry of bulk) {
      const bytes = readFileSync(join(out, entry.key));
      assert.equal(entry.base64, true);
      assert.deepEqual(Buffer.from(entry.value, "base64"), bytes, entry.key);
      assert.equal(entry.metadata.size, bytes.length);
      assert.equal(entry.metadata.sha256, createHash("sha256").update(bytes).digest("hex"));
    }
    assert.equal(bulk[1].metadata.type, "application/x-msdownload");
    assert.deepEqual(JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")), { keys });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("website KV entries: sorted, base64 values, type, checksum and size", () => {
  const exe = Buffer.from([0x4d, 0x5a, 0, 255]);
  const entries = bulkEntries([
    { key: "preview/index.html", bytes: Buffer.from("<p>hi</p>") },
    { key: "download/Clipboxx-Setup.exe", bytes: exe },
  ]);
  assert.deepEqual(entries, [
    {
      key: "download/Clipboxx-Setup.exe",
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
  assert.deepEqual(parseKeyList('▲ [WARNING] Proxy environment variables detected.\nResource location: remote\n[{"name":"index.html"},{"name":"404.html","metadata":{}}]\n'), ["index.html", "404.html"]);
  assert.throws(() => parseKeyList("nothing"), /key list/);
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
  const gate = readFileSync("tools/website/preview-gate.html", "utf8");
  assert.match(gate, /<html lang="zh-CN">/);
  assert.match(gate, /<title>网页测试版 · Clipboxx<\/title>/);
  assert.match(gate, /输入口令/);
  assert.match(gate, /<form method="post" action="\/preview\/">/);
  assert.match(gate, /<input name="key" type="password"[^>]*aria-label="口令">/);
  assert.match(gate, /href="\/"/);
  assert.deepEqual(gate.match(/__[A-Z]+__/g), ["__MESSAGE__"]);
  assert.doesNotMatch(gate, /<script|https?:\/\//);
});
