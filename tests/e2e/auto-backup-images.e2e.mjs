// D-043 in the desktop app: pictures go into the backups folder once each, thumbnails stay out (and come back after a
// restore), and a failed backup is told in 设置. The desktop backup commands are faked here with a folder kept in the
// page's localStorage under a test key, so it survives the reload that follows a restore.
import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";
import { makePng } from "../helpers/png.mjs";

const FOLDER = "test.desktop-backups";

async function fakeBackupFolder(page) {
  await page.addInitScript((key) => {
    const load = () => JSON.parse(localStorage.getItem(key) || '{"days":{},"images":{}}');
    const keep = (all) => localStorage.setItem(key, JSON.stringify(all));
    const toText = (bytes) => { let text = ""; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text); };
    const toBytes = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
    const failing = () => localStorage.getItem("test.backup-fails");
    Object.assign(window.clipboxDesktop, {
      backupSave: async (name, bytes) => {
        if (failing()) throw new Error(failing());
        const all = load();
        all.days[name] = toText(bytes);
        for (const old of Object.keys(all.days).sort().reverse().slice(7)) delete all.days[old];
        keep(all);
      },
      backupList: async () => Object.entries(load().days).map(([name, text]) => ({ name, size: atob(text).length })).sort((a, b) => b.name.localeCompare(a.name)),
      backupRead: async (name) => toBytes(load().days[name]),
      backupImageSave: async (name, bytes) => { const all = load(); all.images[name] = toText(bytes); keep(all); },
      backupImageList: async () => Object.entries(load().images).map(([name, text]) => ({ name, size: atob(text).length })),
      backupImageRead: async (name) => toBytes(load().images[name]),
      backupImagePrune: async (names) => { const all = load(); for (const name of Object.keys(all.images)) if (!names.includes(name)) delete all.images[name]; keep(all); },
    });
  }, FOLDER);
}

const folder = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{"days":{},"images":{}}'), FOLDER);
const thumbCount = (page) => page.evaluate(() => new Promise((resolve) => {
  const open = indexedDB.open("clipbox-image-thumbs");
  open.onsuccess = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains("thumbs")) { db.close(); resolve(0); return; }
    const count = db.transaction("thumbs").objectStore("thumbs").count();
    count.onsuccess = () => { db.close(); resolve(count.result); };
  };
}));

async function openData(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("tab", { name: "数据" }).click();
  return dialog;
}

async function openImages(page) {
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(page.locator(".image-section")).toBeVisible();
}

async function addImage(page, name, color) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "新增图片" }).click()]);
  await chooser.setFiles({ name, mimeType: "image/png", buffer: makePng(1200, 800, color) });
  await expect(page.locator(".image-row", { hasText: name.replace(/\.png$/, "") })).toBeVisible();
}

test("pictures are backed up once as their own files without thumbnails, and come back with a thumbnail after restoring", async ({ page }) => {
  await asDesktop(page, "win32", { imageView: "list" });
  await fakeBackupFolder(page);
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  // Set once (not on every load), so the check after the restore sees what the restore did to it.
  await page.evaluate(() => localStorage.setItem("clipbox.account-premigration.v1", "OLD-DEVICE-KEY-COPY"));
  await openImages(page);
  await addImage(page, "大图一.png", [40, 120, 200]);
  // The thumbnail (320 wide) is made and kept while the picture is shown.
  await expect.poll(() => page.locator(".image-thumb img").first().evaluate((img) => img.naturalWidth)).toBe(320);
  await expect.poll(() => thumbCount(page)).toBe(1);

  // Start again with an empty backups folder so today's backup is taken with the picture in it.
  await page.evaluate((key) => localStorage.removeItem(key), FOLDER);
  await page.reload();
  await page.waitForSelector(".app-shell");
  await expect.poll(async () => Object.keys((await folder(page)).days).length, { timeout: 20_000 }).toBe(1);
  const saved = await folder(page);
  expect(Object.keys(saved.images)).toHaveLength(1);
  expect(Object.keys(saved.images)[0]).toMatch(/^[0-9a-f]{64}\.bin$/);
  const day = atob(Object.values(saved.days)[0]);
  expect(JSON.parse(day).version).toBe(2);
  expect(day).not.toContain("clipbox-image-thumbs");
  expect(day).not.toContain("clipbox.account-premigration.v1");
  expect(day).not.toContain("$b64");

  // A second picture after the backup; restoring brings back the day's state: one picture, with its thumbnail made again.
  await openImages(page);
  await addImage(page, "大图二.png", [200, 80, 40]);
  await expect(page.locator(".image-row")).toHaveCount(2);
  const s = await openData(page);
  await s.locator(".settings-row", { hasText: "从自动备份恢复" }).getByRole("button", { name: "选择…" }).click();
  const dialog = page.getByRole("dialog", { name: "从自动备份恢复" });
  await dialog.getByRole("button", { name: /\d+月\d+日/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("含 1 张图片");
  await expect(dialog.getByRole("alert")).toContainText("2 张图片");
  await dialog.getByRole("button", { name: "确认替换" }).click();
  await page.waitForSelector(".app-shell");
  await openImages(page);
  await expect(page.locator(".image-row")).toHaveCount(1);
  await expect(page.locator(".image-row").first()).toContainText("大图一");
  await expect.poll(() => page.locator(".image-thumb img").first().evaluate((img) => img.naturalWidth)).toBe(320);
  await expect.poll(() => thumbCount(page)).toBe(1);
  // The pre-migration copy belongs to the data that was replaced, so the restore removes it.
  expect(await page.evaluate(() => localStorage.getItem("clipbox.account-premigration.v1"))).toBeNull();
});

test("a failed automatic backup is told in 设置 → 数据, and the next good one clears it", async ({ page }) => {
  await asDesktop(page, "win32");
  await fakeBackupFolder(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem("test.second-load")) localStorage.setItem("test.backup-fails", "too-large"); });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("clipbox.auto-backup.last-error")), { timeout: 20_000 }).not.toBeNull();
  let s = await openData(page);
  const row = s.locator(".settings-row", { hasText: "每天自动备份" });
  await expect(row).toContainText("还没有备份");
  await expect(row.getByRole("status")).toHaveText(/^最近一次自动备份没有成功（\d+月\d+日）：空间不够或内容太多，存不下。可以清理一下电脑空间，或用「完整备份」手动存一份。$/);
  await page.keyboard.press("Escape");

  // The disk has room again: the next start saves today's backup and the line goes away.
  await page.evaluate(() => { localStorage.removeItem("test.backup-fails"); sessionStorage.setItem("test.second-load", "1"); });
  await page.reload();
  await page.waitForSelector(".app-shell");
  s = await openData(page);
  // Shown until the run 8 seconds after start succeeds; the open 设置 updates by itself.
  await expect(s.locator(".settings-row", { hasText: "每天自动备份" })).toContainText(/最近一份：\d+月\d+日/, { timeout: 20_000 });
  await expect(s.getByText("最近一次自动备份没有成功")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("clipbox.auto-backup.last-error"))).toBeNull();
});
