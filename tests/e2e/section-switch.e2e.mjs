// Switching 账号 → 话术 (owner, Windows 2.0.60: "切回话术会自动跳到最底部" and "卡顿"): the 话术 list comes back at the
// top, even when a card further down was left open, and every row is there again.
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets, settle } from "./helpers.mjs";

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: back from 账号, the 话术 list starts at the top with all its rows`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    const rows = page.locator(".content-panel .native-list > .native-row");
    await expect(rows).toHaveCount(34);
    // Open the last card, then scroll back up.
    const last = rows.last();
    await last.scrollIntoViewIfNeeded();
    await last.locator(".row-main").click();
    await expect(last.locator(".row-main")).toHaveAttribute("aria-expanded", "true");
    await page.locator(".content-panel .native-list").evaluate((el) => { el.scrollTop = 0; });

    const sections = page.locator(".kind-switch");
    await sections.getByText("账号").click();
    await expect(rows).toHaveCount(0);
    await sections.getByText("话术").click();
    await expect(rows).toHaveCount(34);
    await settle(page);
    expect(await page.locator(".content-panel .native-list").evaluate((el) => el.scrollTop)).toBe(0);
    // The card stays open; it just does not pull the list down to it.
    await expect(rows.last().locator(".row-main")).toHaveAttribute("aria-expanded", "true");
  });
}
