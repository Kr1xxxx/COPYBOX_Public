import { test, expect } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

async function openMini(page) {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  await expect(page.locator(".mini-top .mini-tab").first()).toBeVisible();
}

test("mini top: one row, 话术/图片 switch first, then 全部 收藏 最近 and the folders", async ({ page }) => {
  await openMini(page);
  const top = page.locator(".mini-top");
  const switchBox = await top.locator(".kind-switch").boundingBox();
  const tabsBox = await top.locator(".mini-tabs").boundingBox();
  expect(tabsBox.x).toBeGreaterThanOrEqual(switchBox.x + switchBox.width - 1);
  expect(Math.abs(tabsBox.y + tabsBox.height / 2 - (switchBox.y + switchBox.height / 2))).toBeLessThan(6);
  const labels = await top.locator(".mini-tab").allTextContents();
  expect(labels.slice(0, 3)).toEqual(["全部", "收藏", "最近"]);
  expect(labels.length).toBeGreaterThan(3);
  await page.waitForTimeout(500);
  expect(await page.locator(".mini-tabs").evaluate((el) => el.scrollLeft)).toBe(0);
  const first = await top.locator(".mini-tab").first().boundingBox();
  expect(first.x).toBeGreaterThanOrEqual(tabsBox.x - 1);
  await expect(page.locator(".mini-search select")).toHaveCount(0);
  await expect(top.getByRole("button", { name: "恢复完整窗口" })).toBeVisible();
});

test("mini top: dragging the tab row scrolls it, keeps the switch in place, and does not pick a tab", async ({ page }) => {
  await openMini(page);
  const tabs = page.locator(".mini-tabs");
  const overflow = await tabs.evaluate((el) => el.scrollWidth - el.clientWidth);
  test.skip(overflow <= 0, "the sample folders fit in one row");
  await page.waitForTimeout(300);
  const switchBefore = await page.locator(".kind-switch").boundingBox();
  const box = await tabs.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => tabs.evaluate((el) => el.scrollLeft)).toBeGreaterThan(20);
  await expect(page.locator(".mini-tab.active")).toHaveText("全部");
  const switchAfter = await page.locator(".kind-switch").boundingBox();
  expect(Math.abs(switchAfter.x - switchBefore.x)).toBeLessThanOrEqual(1);
  await tabs.evaluate((el) => { el.scrollLeft = 0; });
});

test("mini top: a click on a tab switches the list", async ({ page }) => {
  await openMini(page);
  await page.locator(".mini-tab", { hasText: "收藏" }).click();
  await expect(page.locator(".mini-tab.active")).toHaveText("收藏");
});
