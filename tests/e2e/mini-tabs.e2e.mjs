import { test, expect } from "@playwright/test";
import { asDesktop, seedSnippets, settle } from "./helpers.mjs";

async function openMini(page) {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  await expect(page.locator(".mini-top .mini-tab").first()).toBeVisible();
}

test("mini top: 话术/图片 switch first, then 全部 收藏 最近; the folders sit under the search box", async ({ page }) => {
  await openMini(page);
  const top = page.locator(".mini-top");
  const switchBox = await top.locator(".kind-switch").boundingBox();
  const tabsBox = await top.locator(".mini-tabs").boundingBox();
  expect(tabsBox.x).toBeGreaterThanOrEqual(switchBox.x + switchBox.width - 1);
  expect(Math.abs(tabsBox.y + tabsBox.height / 2 - (switchBox.y + switchBox.height / 2))).toBeLessThan(6);
  await expect(top.locator(".mini-tab")).toHaveText(["全部", "收藏", "最近"]);
  await settle(page); // the row has not been scrolled once everything has come to rest
  expect(await page.locator(".mini-top .mini-tabs").evaluate((el) => el.scrollLeft)).toBe(0);
  const first = await top.locator(".mini-tab").first().boundingBox();
  expect(first.x).toBeGreaterThanOrEqual(tabsBox.x - 1);
  await expect(page.locator(".mini-search select")).toHaveCount(0);
  await expect(page.locator(".mini-favorites")).toHaveCount(0);
  await expect(top.getByRole("button", { name: "恢复完整窗口" })).toBeVisible();
  const folders = page.locator(".mini-folders .mini-tab");
  expect(await folders.count()).toBeGreaterThan(0);
  const searchBox = await page.locator(".mini-search").boundingBox();
  const rowBox = await page.locator(".mini-folders").boundingBox();
  expect(rowBox.y).toBeGreaterThanOrEqual(searchBox.y + searchBox.height - 1);
});

test("mini top: dragging the tab row scrolls it, keeps the switch in place, and does not pick a tab", async ({ page }) => {
  await openMini(page);
  const tabs = page.locator(".mini-folders .mini-tabs");
  const overflow = await tabs.evaluate((el) => el.scrollWidth - el.clientWidth);
  test.skip(overflow <= 0, "the sample folders fit in one row");
  await settle(page);
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

test("mini folder row: a click on a folder shows it and marks it", async ({ page }) => {
  await openMini(page);
  const folder = page.locator(".mini-folders .mini-tab").first();
  const name = (await folder.textContent()).trim();
  await folder.click();
  await expect(page.locator(".mini-folders .mini-tab.active")).toHaveText(name);
  await expect(page.locator(".mini-top .mini-tab.active")).toHaveCount(0);
  await page.locator(".mini-top .mini-tab", { hasText: "全部" }).click();
  await expect(page.locator(".mini-folders .mini-tab.active")).toHaveCount(0);
});

test("mini top: switching 话术 ↔ 图片 does not move anything", async ({ page }) => {
  await openMini(page);
  const spots = async () => page.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null; };
    return { sw: r(".mini-top .kind-switch"), all: r(".mini-top .mini-tab"), search: r(".mini-search"), folders: r(".mini-folders"), restore: r(".mini-top .icon-button") };
  });
  await settle(page);
  const before = await spots();
  await page.locator(".kind-switch.compact").getByRole("button", { name: "图片" }).click();
  await expect(page.locator(".mini-top .mini-tab")).toHaveText(["全部", "收藏", "最近"]);
  await expect(page.locator(".image-section")).toBeVisible();
  await settle(page);
  expect(await spots()).toEqual(before);
  await page.locator(".kind-switch.compact").getByRole("button", { name: "话术" }).click();
  await expect(page.locator(".native-row").first()).toBeVisible();
  await settle(page);
  expect(await spots()).toEqual(before);
});
