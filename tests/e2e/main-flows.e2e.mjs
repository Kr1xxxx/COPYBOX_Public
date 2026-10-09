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

test("variables are highlighted blocks without brackets and are typed in place", async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => { window.__copied = text; }, configurable: true }); });
  const rows = page.locator(".native-row .row-main");
  await rows.first().click();
  const row = page.locator(".native-row.selected");
  // the open card shows fields, not bracketed text, and there is no separate fill page or button
  await expect(row.locator(".row-content")).not.toContainText("[");
  await expect(row.getByRole("button", { name: "填写变量" })).toHaveCount(0);
  await expect(page.locator(".fill-panel")).toHaveCount(0);
  const name = row.locator("input[data-var=Name]");
  const widthBefore = (await name.evaluate((input) => input.parentElement.getBoundingClientRect().width));
  await name.click();
  await page.keyboard.type("Amanda Rodriguez");
  const widthAfter = (await name.evaluate((input) => input.parentElement.getBoundingClientRect().width));
  expect(widthAfter).toBeGreaterThan(widthBefore);
  // an unfinished variable stops the copy and puts the cursor in the next empty block
  await row.getByRole("button", { name: "复制", exact: true }).click();
  await expect(row.locator("input[data-var=Company]")).toBeFocused();
  await page.keyboard.type("Comely Beauty");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("Hi Amanda Rodriguez, thanks for reaching out to Comely Beauty! How can I help you today?");
  // the closed list shows variables as plain highlighted names too
  await rows.nth(1).click();
  await expect(page.locator(".snippet-preview").first()).not.toContainText("[");
});

test("a variable remembers the last value, and with one variable Enter copies the finished text", async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => { window.__copied = text; }, configurable: true }); });
  await page.locator(".native-row", { hasText: "自我介绍" }).locator(".row-main").click();
  const row = page.locator(".native-row.selected");
  await expect(row).toHaveCount(1);
  // typing then Enter walks through the empty blocks; the last Enter copies
  await row.locator("input[data-var=Name]").click();
  await page.keyboard.type("Amanda");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Comely");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("Hi Amanda, thanks for reaching out to Comely! How can I help you today?");
  // another snippet with the same variable starts with the remembered value, marked as remembered
  await page.locator(".native-row", { hasText: "二次问候" }).locator(".row-main").click();
  await expect(page.locator(".native-row.selected")).toHaveCount(1);
  const same = page.locator(".native-row.selected input[data-var=Name]");
  await expect(same).toHaveValue("Amanda");
  await expect(same.locator("..")).toHaveAttribute("data-remembered", "");
  // a snippet with exactly one variable: Enter copies the text right away
  await same.click();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__copied)).toContain("Amanda");
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

test("English word search is a separate mode next to the pinyin one", async ({ page }) => {
  const search = page.locator("input[placeholder*=搜索]");
  await search.fill("lashes");
  const modes = page.getByRole("group", { name: "搜索方式" });
  await expect(modes).toBeVisible();
  await modes.getByRole("button", { name: "英文单词" }).click();
  await expect(search).toHaveAttribute("placeholder", "搜索英文单词");
  expect(await page.locator(".native-row").count()).toBeGreaterThan(0);
  await search.fill("zzzzq");
  await expect(page.locator(".native-row")).toHaveCount(0);
  await search.fill("");
  await expect(search).toHaveAttribute("placeholder", "搜索标题、编号或内容");
});
