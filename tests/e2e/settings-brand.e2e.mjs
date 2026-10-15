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

test("the brand fonts ship with the app: Poppins and Lora load from its own files, not from the computer", async ({ page }) => {
  await asDesktop(page, "win32");
  await openSettings(page);
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([document.fonts.load('600 16px "Poppins"', "Settings"), document.fonts.load('400 13px "Lora"', "API Key")]);
    return [...document.fonts].filter((face) => face.status === "loaded").map((face) => `${face.family.replaceAll('"', "")} ${face.weight}`).sort();
  });
  expect(loaded).toEqual(expect.arrayContaining(["Lora 400", "Poppins 600"]));
  // Chinese uses MiSans on Windows, and 关于 says so, as its licence asks.
  const cjk = await page.evaluate(async () => { await document.fonts.load('600 16px "MiSans"', "设置"); return [...document.fonts].some((face) => face.family.replaceAll('"', "") === "MiSans" && face.status === "loaded"); });
  expect(cjk).toBe(true);
  expect(await page.locator(".settings-dialog .settings-page-title, .settings-dialog .settings-row strong").first().evaluate((el) => getComputedStyle(el).fontFamily)).toContain("MiSans");
  await page.getByRole("tab", { name: "关于" }).click();
  await expect(page.locator(".settings-dialog")).toContainText("MiSans");
});

test("on the Mac, Chinese in Settings stays in PingFang, not MiSans", async ({ page }) => {
  await asDesktop(page, "darwin");
  await openSettings(page);
  const family = await page.locator(".settings-dialog .settings-row strong").first().evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toContain("PingFang SC");
  expect(family).not.toContain("MiSans");
});

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
