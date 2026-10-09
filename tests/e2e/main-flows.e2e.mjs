import { expect, test } from "@playwright/test";
import { pinyin } from "pinyin-pro";
import { seedSnippets } from "./helpers.mjs";

test.beforeEach(async ({ page }) => { await seedSnippets(page); });

test("importing the sample sheet gives 34 snippets and the standard folders", async ({ page }) => {
  await expect(page.locator(".native-row")).toHaveCount(34);
  await expect(page.locator(".sidebar")).toContainText("询盘接待");
});

test("switching entries folds the old card away gradually instead of removing it at once", async ({ page }) => {
  await page.locator(".native-row .row-main").nth(1).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__heights = [];
    const start = performance.now();
    const tick = () => {
      const closing = document.querySelector(".row-detail.closing");
      if (closing) window.__heights.push(closing.getBoundingClientRect().height);
      if (performance.now() - start < 500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.locator(".native-row .row-main").nth(4).click();
  await page.waitForTimeout(700);
  const heights = await page.evaluate(() => window.__heights);
  expect(heights.length).toBeGreaterThan(4);
  expect(heights[0]).toBeGreaterThan(heights.at(-1));
  await expect(page.locator(".row-detail.closing")).toHaveCount(0);
  await expect(page.locator(".native-row.selected")).toHaveCount(1);
  // the fading border must not show the white card background underneath
  const clip = await page.locator(".native-row.selected").evaluate((row) => getComputedStyle(row).backgroundClip);
  expect(clip).toBe("padding-box");
});

test("with many variables the copy bar stays inside the window", async ({ page }) => {
  const rows = page.locator(".native-row .row-main");
  for (let i = 0; i < 12; i += 1) {
    await rows.nth(i).click();
    await page.waitForTimeout(300);
    const fill = page.locator(".native-row.selected").getByRole("button", { name: "填写变量" });
    if (await fill.count()) { await fill.click(); break; }
  }
  await expect(page.locator(".fill-panel")).toBeVisible();
  await page.evaluate(() => {
    const fields = document.querySelector(".fill-panel .copy-fields");
    const label = fields.querySelector("label");
    for (let i = 0; i < 6; i += 1) fields.appendChild(label.cloneNode(true));
  });
  const box = await page.evaluate(() => {
    const list = document.querySelector(".native-list");
    list.scrollTop = 0;
    return { bar: document.querySelector(".fill-actions").getBoundingClientRect().bottom, list: list.getBoundingClientRect().bottom };
  });
  expect(box.bar).toBeLessThanOrEqual(box.list + 1);
});

test("no keyboard shortcut hints anywhere and Ctrl+E does nothing", async ({ page }) => {
  await expect(page.locator("kbd")).toHaveCount(0);
  await page.keyboard.press("Control+e");
  await page.waitForTimeout(200);
  await expect(page.locator(".inline-editor")).toHaveCount(0);
  // plain arrows in the search box still move the selection
  await page.locator("input[placeholder*=搜索]").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".native-row.selected")).toHaveCount(1);
});

test("the snippet note field is called 小提示", async ({ page }) => {
  await page.getByRole("button", { name: /新增/ }).first().click();
  await page.locator(".inline-editor input").first().fill("测试话术");
  await page.locator(".inline-editor textarea").first().fill("Hello there");
  await page.locator(".inline-editor .editor-save").first().click();
  await page.locator(".native-row", { hasText: "测试话术" }).locator(".row-main").click();
  await page.locator(".native-row.selected").getByRole("button", { name: "编辑" }).click();
  await expect(page.locator(".inline-editor")).toContainText("小提示");
  await expect(page.locator(".inline-editor")).not.toContainText("备注");
});

test("typing pinyin initials finds Chinese snippets", async ({ page }) => {
  const search = page.locator("input[placeholder*=搜索]");
  const total = await page.locator(".native-row").count();
  await search.fill("zzzzq");
  await expect(page.locator(".native-row")).toHaveCount(0);
  const syllables = pinyin("询盘", { toneType: "none", type: "array" });
  await search.fill(syllables.map((syllable) => syllable[0]).join(""));
  const found = await page.locator(".native-row").count();
  expect(found).toBeGreaterThan(0);
  expect(found).toBeLessThan(total);
  await expect(page.locator(".native-row").first()).toBeVisible();
});
