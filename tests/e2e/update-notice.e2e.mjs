import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

async function withUpdate(page, result, platform = "win32") {
  await asDesktop(page, platform);
  await page.addInitScript((value) => {
    window.__opened = 0;
    const desktop = window.clipboxDesktop;
    desktop.checkUpdate = async () => value;
    desktop.openUpdate = async () => { window.__opened += 1; return true; };
  }, result);
}

for (const platform of ["win32", "darwin"]) test(`a newer version shows a banner; 稍后 hides that version only (${platform})`, async ({ page }) => {
  await withUpdate(page, { status: "available", version: "0.2.25", notes: ["修复复制图片", "更快的搜索"] }, platform);
  await seedSnippets(page);
  const banner = page.locator(".update-banner");
  await expect(banner).toContainText("有新版本 0.2.25");
  await expect(banner).toContainText("修复复制图片");
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
