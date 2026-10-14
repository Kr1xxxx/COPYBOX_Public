import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

// The viewer's clock is set far from Taipei, so the dates below prove the page counts on the Taipei calendar.
test.use({ timezoneId: "America/Los_Angeles" });

async function openSettings(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.waitForSelector(".settings-dialog");
}

test("Settings home shows the version and update date at the top, plus 账号 and 同步 with the last sync time", async ({ page }) => {
  await asDesktop(page, "win32");
  // A company library sync from before: 2026-10-14 01:05 UTC is 09:05 in Taipei.
  await page.addInitScript(() => { localStorage.setItem("clipbox.shared-library-last", JSON.stringify({ at: Date.UTC(2026, 9, 14, 1, 5), total: 3, added: 3, updated: 0, keptMine: 0, retired: 0, restored: 0, skipped: 0 })); });
  await seedSnippets(page);
  await openSettings(page);
  const dialog = page.locator(".settings-dialog");
  // helpers.mjs builds at 2026-10-10 21:37 on the viewer's clock (Los Angeles), which is already 10-11 in Taipei.
  const version = dialog.locator(".settings-brand .settings-brand-version");
  await expect(version).toHaveText("v0.0.0-test · 2026年10月11日更新");
  await expect(version).not.toContainText("台北");

  const card = dialog.locator("section[aria-labelledby=set-home-account]");
  await expect(card).toBeVisible();
  await expect(card.locator(".settings-last-sync")).toHaveText("最后同步 2026年10月14日 09:05");

  // The 企业同步码 sits right here (D-052), empty until someone types the code they were given.
  await expect(card.getByLabel("企业同步码")).toHaveValue("");
  await expect(card.getByRole("button", { name: "立即同步" })).toBeDisabled();

  // 安全设置 goes to the 安全 card; 打开账号页 closes Settings on the 账号 page.
  await card.getByRole("button", { name: "安全设置" }).click();
  await expect(dialog.locator("#set-security")).toBeInViewport();
  await dialog.getByRole("tab", { name: "概览" }).click();
  await card.getByRole("button", { name: "打开账号页" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".kind-switch").getByRole("button", { name: "账号" })).toHaveAttribute("aria-pressed", "true");
});

test("Settings home says when nothing was synced yet", async ({ page }) => {
  await seedSnippets(page);
  await openSettings(page);
  const card = page.locator(".settings-dialog section[aria-labelledby=set-home-account]");
  await expect(card.locator(".settings-last-sync")).toHaveText("还没有同步过");
});
