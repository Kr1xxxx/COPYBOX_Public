import { test, expect } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: the 收起 button in the list header folds the open 话术 card, left of 选择`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    const collapse = page.getByRole("button", { name: "收起展开的话术" });
    const select = page.locator(".section-head .select-toggle", { hasText: "选择" });
    const open = page.locator(".native-row.selected .row-detail");
    await expect(open).toHaveCount(1);
    await expect(collapse).toBeVisible();
    const a = await collapse.boundingBox();
    const b = await select.boundingBox();
    expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1);
    expect(Math.abs(a.y - b.y)).toBeLessThan(4);
    await collapse.click();
    await expect(page.locator(".native-row.selected")).toHaveCount(0);
    await expect(collapse).toHaveCount(0);
    // opening a card again brings the button back
    await page.locator(".native-row .row-main").nth(1).click();
    await expect(page.locator(".native-row.selected")).toHaveCount(1);
    await expect(collapse).toBeVisible();
  });
}
