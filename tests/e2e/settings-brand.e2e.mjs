import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

// Settings follows the brand-guidelines palette like the popups (owner 2026-10-15): brand light / dark surface, ink
// text, an orange bar on the selected tab, and one hairline between rows. Visual only: tabs and rows stay where they were.
async function openSettings(page) {
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.waitForSelector(".settings-dialog");
}
const style = (locator, prop, pseudo) => locator.evaluate((el, [p, ps]) => getComputedStyle(el, ps).getPropertyValue(p), [prop, pseudo ?? null]);

for (const [scheme, surface, ink] of [["light", "rgb(250, 249, 245)", "rgb(20, 20, 19)"], ["dark", "rgb(20, 20, 19)", "rgb(250, 249, 245)"]]) {
  test(`Settings uses the brand palette (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await asDesktop(page, "win32");
    await openSettings(page);
    const dialog = page.locator(".settings-dialog");
    expect(await style(dialog, "background-color")).toBe(surface);
    expect(await style(dialog.locator(".settings-row strong").first(), "color")).toBe(ink);
    expect(await style(dialog.locator(".settings-tab-pill"), "background-color", "::before")).toBe("rgb(217, 119, 87)");
    await expect(dialog.getByRole("tab")).toHaveText(["概览", "目录", "数据", "安全", "使用排行", "窗口", "AI", "关于"]);
  });
}

test("Settings rows are split by a single hairline, never a doubled one", async ({ page }) => {
  await asDesktop(page, "darwin");
  await openSettings(page);
  for (const tab of ["概览", "数据", "安全", "窗口", "关于"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    const doubled = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#settings-panel .settings-row")].filter((el) => el.offsetParent);
      return rows.filter((row) => {
        const next = row.nextElementSibling;
        return next?.classList.contains("settings-row") && parseFloat(getComputedStyle(row).borderBottomWidth) > 0 && parseFloat(getComputedStyle(next).borderTopWidth) > 0;
      }).length;
    });
    expect(doubled, tab).toBe(0);
    // A note right under a row still gets its line, now that rows draw only the line above them.
    const bare = await page.evaluate(() => [...document.querySelectorAll("#settings-panel .settings-row + .settings-note")].filter((el) => el.offsetParent && parseFloat(getComputedStyle(el).borderTopWidth) === 0).length);
    expect(bare, tab).toBe(0);
  }
});
