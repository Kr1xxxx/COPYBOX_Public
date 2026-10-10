import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { compareVersions, createUpdateChecker, isSafeDownloadUrl } = require("../desktop/update-check.cjs");

const json = (body, ok = true) => async () => ({ ok, json: async () => body });

test("versions compare numerically, not as text", () => {
  assert.equal(compareVersions("0.2.25", "0.2.24"), 1);
  assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
  assert.equal(compareVersions("v0.2.24", "0.2.24"), 0);
  assert.equal(compareVersions("0.2.23", "0.2.24"), -1);
  assert.equal(compareVersions("abc", "0.2.24"), null);
});

test("only https download links are accepted", () => {
  assert.equal(isSafeDownloadUrl("https://example.com/Clipbox-Setup.exe"), true);
  assert.equal(isSafeDownloadUrl("http://example.com/x.exe"), false);
  assert.equal(isSafeDownloadUrl("file:///C:/x.exe"), false);
  assert.equal(isSafeDownloadUrl("javascript:alert(1)"), false);
});

test("the reminder is off when no address is configured", async () => {
  const checker = createUpdateChecker({ url: "", currentVersion: "0.2.24", fetchImpl: () => { throw new Error("must not fetch"); } });
  assert.deepEqual(await checker.check(), { status: "disabled" });
});

test("a newer version is reported with trimmed notes and its download link is kept inside the main process", async () => {
  const checker = createUpdateChecker({
    url: "https://example.com/latest.json", currentVersion: "0.2.24",
    fetchImpl: json({ version: "0.2.25", notes: ["修复一", " ", "修复二"], url: "https://example.com/Clipbox-Setup.exe" }),
  });
  const result = await checker.check();
  assert.deepEqual(result, { status: "available", version: "0.2.25", notes: ["修复一", "修复二"] });
  assert.equal(checker.getDownloadUrl(), "https://example.com/Clipbox-Setup.exe");
});

test("same or older version, bad data and network failures all stay quiet", async () => {
  const url = "https://example.com/latest.json";
  const same = createUpdateChecker({ url, currentVersion: "0.2.24", fetchImpl: json({ version: "0.2.24", url: "https://a.com/x" }) });
  assert.equal((await same.check()).status, "current");
  const unsafe = createUpdateChecker({ url, currentVersion: "0.2.24", fetchImpl: json({ version: "0.3.0", url: "http://a.com/x" }) });
  assert.equal((await unsafe.check()).status, "error");
  const bad = createUpdateChecker({ url, currentVersion: "0.2.24", fetchImpl: json({ nope: 1 }) });
  assert.equal((await bad.check()).status, "error");
  const http500 = createUpdateChecker({ url, currentVersion: "0.2.24", fetchImpl: json({}, false) });
  assert.equal((await http500.check()).status, "error");
  const offline = createUpdateChecker({ url, currentVersion: "0.2.24", fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal((await offline.check()).status, "error");
});

test("the page can only ask to open the stored link, never pass its own", () => {
  const main = fs.readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");
  const preload = fs.readFileSync(new URL("../desktop/preload.cjs", import.meta.url), "utf8");
  assert.match(main, /ipcMain\.handle\("clipbox:open-update", async \(\) =>/);
  assert.match(preload, /openUpdate: \(\) => ipcRenderer\.invoke\("clipbox:open-update"\)/);
});
