import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

// Fakes the shell's update calls. `install` adds installUpdate/onUpdateProgress (a shell with D-047); the test then
// drives progress with window.__progress(received, total) and ends the download with window.__finish(result).
async function withUpdate(page, result, platform = "win32", { install = false } = {}) {
  await asDesktop(page, platform);
  await page.addInitScript(({ value, install }) => {
    window.__opened = 0;
    window.__installs = 0;
    const desktop = window.clipboxDesktop;
    desktop.checkUpdate = async () => value;
    desktop.openUpdate = async () => { window.__opened += 1; return true; };
    if (!install) return;
    const listeners = new Set();
    desktop.onUpdateProgress = (callback) => { listeners.add(callback); return () => listeners.delete(callback); };
    window.__progress = (received, total) => listeners.forEach((callback) => callback({ received, total }));
    desktop.installUpdate = () => {
      window.__installs += 1;
      return new Promise((resolve) => { window.__finish = resolve; });
    };
  }, { value: result, install });
}

const available = { status: "available", version: "0.2.25", notes: ["修复复制图片", "更快的搜索"], installable: true };
const MB = 1024 * 1024;

for (const platform of ["win32", "darwin"]) test(`a newer version shows a banner; 稍后 hides that version only (${platform})`, async ({ page }) => {
  await withUpdate(page, { status: "available", version: "0.2.25", notes: ["修复复制图片", "更快的搜索"] }, platform);
  await seedSnippets(page);
  const banner = page.locator(".update-banner");
  await expect(banner).toContainText("有新版本 0.2.25");
  await expect(banner).toContainText("修复复制图片");
  // A shell without installUpdate (older version, or the Mac) keeps the browser download.
  await expect(banner.getByRole("button", { name: "立即更新" })).toHaveCount(0);
  await banner.getByRole("button", { name: "下载" }).click();
  expect(await page.evaluate(() => window.__opened)).toBe(1);
  await banner.getByRole("button", { name: "稍后" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await page.waitForSelector(".app-shell");
  await expect(page.locator(".update-banner")).toHaveCount(0);
});

test("no banner when the app is up to date", async ({ page }) => {
  await withUpdate(page, { status: "current" });
  await seedSnippets(page);
  await expect(page.locator(".update-banner")).toHaveCount(0);
});

test("立即更新 downloads with a progress bar, then says it is installing", async ({ page }) => {
  await withUpdate(page, available, "win32", { install: true });
  await seedSnippets(page);
  const banner = page.locator(".update-banner");
  await expect(banner.getByRole("button", { name: "下载" })).toHaveCount(0);
  await banner.getByRole("button", { name: "立即更新" }).click();
  const bar = banner.getByRole("progressbar", { name: "下载进度" });
  await expect(bar).toHaveAttribute("aria-valuenow", "0");
  await expect(banner).toContainText("正在下载新版本 0.2.25");
  // No buttons while it downloads, so it cannot be started twice or hidden halfway.
  await expect(banner.getByRole("button")).toHaveCount(0);

  await page.evaluate((mb) => window.__progress(Math.round(1.3 * mb), Math.round(5.2 * mb)), MB);
  await expect(bar).toHaveAttribute("aria-valuenow", "25");
  await expect(banner).toContainText("25% · 已下载 1.3 / 5.2 MB");
  await page.evaluate((mb) => window.__progress(Math.round(3.1 * mb), Math.round(5.2 * mb)), MB);
  await expect(bar).toHaveAttribute("aria-valuenow", "59");
  await expect(banner).toContainText("已下载 3.1 / 5.2 MB");

  await page.evaluate((mb) => window.__progress(Math.round(5.2 * mb), Math.round(5.2 * mb)), MB);
  await expect(banner).toContainText("正在安装，马上自动重新打开");
  await page.evaluate(() => window.__finish({ status: "installing" }));
  await expect(banner).toContainText("正在安装，马上自动重新打开");
  await expect(bar).toHaveAttribute("aria-valuenow", "100");
  expect(await page.evaluate(() => window.__installs)).toBe(1);
});

test("a failed update says why and offers 重试 and 去网站下载", async ({ page }) => {
  await withUpdate(page, available, "win32", { install: true });
  await seedSnippets(page);
  const banner = page.locator(".update-banner");
  await banner.getByRole("button", { name: "立即更新" }).click();
  await page.evaluate(() => window.__progress(1000, 5000));
  await page.evaluate(() => window.__finish({ status: "error", reason: "network" }));
  await expect(banner).toContainText("更新没成功：网络连不上或断了");
  await expect(banner.getByRole("progressbar")).toHaveCount(0);

  await banner.getByRole("button", { name: "去网站下载" }).click();
  expect(await page.evaluate(() => window.__opened)).toBe(1);

  await banner.getByRole("button", { name: "重试" }).click();
  await expect(banner.getByRole("progressbar", { name: "下载进度" })).toHaveAttribute("aria-valuenow", "0");
  expect(await page.evaluate(() => window.__installs)).toBe(2);
  await page.evaluate(() => window.__finish({ status: "error", reason: "incomplete" }));
  await expect(banner).toContainText("更新没成功：下载的文件不完整");
});

test("稍后 still hides that version when 立即更新 is offered", async ({ page }) => {
  await withUpdate(page, available, "win32", { install: true });
  await seedSnippets(page);
  const banner = page.locator(".update-banner");
  await expect(banner.getByRole("button", { name: "立即更新" })).toBeVisible();
  await banner.getByRole("button", { name: "稍后" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await page.waitForSelector(".app-shell");
  await expect(page.locator(".update-banner")).toHaveCount(0);
  expect(await page.evaluate(() => window.__installs)).toBe(0);
});

test("a version the shell cannot install itself keeps 下载", async ({ page }) => {
  await withUpdate(page, { ...available, installable: false }, "win32", { install: true });
  await seedSnippets(page);
  const banner = page.locator(".update-banner");
  await expect(banner.getByRole("button", { name: "立即更新" })).toHaveCount(0);
  await banner.getByRole("button", { name: "下载" }).click();
  expect(await page.evaluate(() => window.__opened)).toBe(1);
});

test("an installer that is not ours is refused without 重试 or 去网站下载", async ({ page }) => {
  await withUpdate(page, available, "win32", { install: true });
  await seedSnippets(page);
  const banner = page.locator(".update-banner");
  await banner.getByRole("button", { name: "立即更新" }).click();
  await page.evaluate(() => window.__finish({ status: "error", reason: "signature" }));
  await expect(banner).toContainText("更新没成功：安装包不是官方发布的，为了安全没有安装");
  await expect(banner).toContainText("现在的版本照常能用");
  // Retrying would fetch the same file, and the website may be what was tampered with.
  await expect(banner.getByRole("button", { name: "重试" })).toHaveCount(0);
  await expect(banner.getByRole("button", { name: "去网站下载" })).toHaveCount(0);
  await banner.getByRole("button", { name: "知道了" }).click();
  await expect(banner).toHaveCount(0);
  expect(await page.evaluate(() => window.__opened)).toBe(0);
});
