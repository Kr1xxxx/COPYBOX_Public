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
