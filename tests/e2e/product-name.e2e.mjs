import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

// D-044: the product is called Clipboxx (复制盒). The first settings page opens with both names; 关于 carries the new name.
for (const platform of ["win32", "darwin"]) {
  test(`${platform}: settings opens with Clipboxx 复制盒 at the top, and 关于 shows Clipboxx v…`, async ({ page }) => {
    await asDesktop(page, platform);
    await page.goto("/");
    await page.waitForSelector(".app-shell");
    await page.getByRole("button", { name: /设置/ }).first().click();
    const settings = page.getByRole("dialog", { name: "设置" });
    const body = settings.locator(".settings-body");
    const brand = body.locator(".settings-brand");
    await expect(brand).toBeVisible();
    await expect(brand.locator("strong")).toHaveText("Clipboxx");
    await expect(brand.locator("span")).toHaveText("复制盒");
    // It is the very first thing on the first page, above the page title and the 外观 rows.
    await expect(body.locator(":scope > *").first()).toHaveClass(/settings-brand/);
    const brandBox = await brand.boundingBox();
    const titleBox = await body.locator(".settings-page-title").boundingBox();
    expect(brandBox.y + brandBox.height).toBeLessThanOrEqual(titleBox.y);
    // Only the first page carries it, and searching hides it.
    await settings.getByRole("tab", { name: "关于" }).click();
    await expect(brand).toHaveCount(0);
    await expect(settings.getByText(/^Clipboxx v/)).toBeVisible();
    await expect(settings.getByText(/Clipbox /)).toHaveCount(0);
    await settings.getByRole("tab", { name: "外观" }).click();
    await expect(brand).toBeVisible();
    await settings.getByRole("searchbox", { name: "搜索设置" }).fill("主题");
    await expect(brand).toHaveCount(0);
  });
}
