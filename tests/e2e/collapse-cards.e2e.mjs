import { test, expect } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

const openCards = (page) => page.locator(".native-row.selected .row-detail");

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: the list starts folded; 收起 sits left of 选择 and folds the open card`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    const collapse = page.getByRole("button", { name: "收起展开的话术" });
    const select = page.locator(".section-head .select-toggle", { hasText: "选择" });
    await expect(page.locator(".native-row").first()).toBeVisible();
    await expect(openCards(page)).toHaveCount(0);
    await expect(collapse).toHaveCount(0);
    await page.locator(".native-row .row-main").first().click();
    await expect(openCards(page)).toHaveCount(1);
    await expect(collapse).toBeVisible();
    const a = await collapse.boundingBox();
    const b = await select.boundingBox();
    expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1);
    expect(Math.abs(a.y - b.y)).toBeLessThan(4);
    await collapse.click();
    await expect(page.locator(".native-row.selected")).toHaveCount(0);
    await expect(collapse).toHaveCount(0);
    await page.locator(".native-row .row-main").nth(1).click();
    await expect(openCards(page)).toHaveCount(1);
    await expect(collapse).toBeVisible();
  });
}

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: an open card has its own 收起, left of 英文|中文 and the star; it folds the card and forgets it`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    await page.locator(".native-row .row-main").first().click();
    const card = page.locator(".native-row.selected");
    await expect(openCards(page)).toHaveCount(1);
    const collapse = card.getByRole("button", { name: "收起这条话术" });
    await expect(collapse).toHaveText("收起");
    const toggle = card.locator(".row-language");
    await expect(toggle).toBeVisible();
    const [c, t, star] = [await collapse.boundingBox(), await toggle.boundingBox(), await card.locator(".native-pin").boundingBox()];
    expect(c.x + c.width).toBeLessThanOrEqual(t.x + 0.5); // just left of 英文
    expect(t.x - (c.x + c.width)).toBeLessThan(8);
    expect(c.x + c.width).toBeLessThanOrEqual(star.x);
    expect(Math.abs(c.height - t.height)).toBeLessThan(0.5); // same height, same centre line as the toggle
    expect(Math.abs((c.y + c.height / 2) - (t.y + t.height / 2))).toBeLessThan(1);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clipbox.open-card"))).toBeTruthy();
    await collapse.click();
    await expect(page.locator(".row-detail")).toHaveCount(0);
    await expect(page.locator(".native-row.selected")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clipbox.open-card"))).toBeFalsy();
    // Closed cards do not show it.
    await expect(page.getByRole("button", { name: "收起这条话术" })).toHaveCount(0);
  });

  test(`${platform}: a card without Chinese text still shows 收起 just left of the star`, async ({ page }) => {
    await asDesktop(page, platform);
    await page.goto("/");
    await page.getByRole("button", { name: /新增/ }).first().click();
    const editor = page.locator(".inline-editor");
    await editor.locator("input").first().fill("只有英文");
    await editor.locator("textarea").first().fill("Hello there, only English here.");
    await editor.locator(".editor-save").first().click();
    await page.locator(".native-row", { hasText: "只有英文" }).locator(".row-main").click();
    const card = page.locator(".native-row.selected");
    await expect(openCards(page)).toHaveCount(1);
    await expect(card.locator(".row-language")).toHaveCount(0);
    const collapse = card.getByRole("button", { name: "收起这条话术" });
    await expect(collapse).toBeVisible();
    const [c, star] = [await collapse.boundingBox(), await card.locator(".native-pin").boundingBox()];
    expect(c.x + c.width).toBeLessThanOrEqual(star.x + 0.5);
    expect(star.x - (c.x + c.width)).toBeLessThan(8);
    await collapse.click();
    await expect(page.locator(".row-detail")).toHaveCount(0);
  });
}

test("the card that was open comes back after another page, and after a reload; 收起 forgets it", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  const rows = page.locator(".native-row .row-main");
  await rows.nth(2).click();
  const title = (await page.locator(".native-row.selected .row-main").first().innerText()).split("\n")[0];
  await expect(openCards(page)).toHaveCount(1);
  await page.getByRole("button", { name: "图片" }).first().click();
  await page.getByRole("button", { name: "话术" }).first().click();
  await expect(openCards(page)).toHaveCount(1);
  await expect(page.locator(".native-row.selected .row-main").first()).toContainText(title);
  await page.reload();
  await expect(page.locator(".native-row").first()).toBeVisible();
  await expect(openCards(page)).toHaveCount(1);
  await page.getByRole("button", { name: "收起展开的话术" }).click();
  await page.reload();
  await expect(page.locator(".native-row").first()).toBeVisible();
  await expect(openCards(page)).toHaveCount(0);
});

test("searching still opens the top result so Enter copies what is shown", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await page.getByPlaceholder("搜索标题、编号或内容").fill("催");
  await expect(openCards(page)).toHaveCount(1);
});
