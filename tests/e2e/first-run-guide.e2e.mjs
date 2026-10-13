import { expect, test } from "@playwright/test";
import { asDesktop, GUIDE_UNSEEN } from "./helpers.mjs";

// The first-run guide: shown once on a fresh start, four pages, remembered after any close.
test.use({ storageState: GUIDE_UNSEEN });

const guide = (page) => page.getByRole("dialog", { name: /话术|图片|账号|迷你窗口/ });
const dots = (page) => guide(page).getByRole("group", { name: "第几步" }).getByRole("button");

async function freshStart(page) {
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await expect(guide(page)).toBeVisible();
}

test("a fresh start shows the guide; 下一步, 上一步 and the dots move between pages", async ({ page }) => {
  await freshStart(page);
  await expect(guide(page).getByRole("heading")).toHaveText("话术：常用回复，一键复制");
  await expect(guide(page)).toContainText("1 / 4");
  await expect(dots(page)).toHaveCount(4);
  await expect(dots(page).nth(0)).toHaveAttribute("aria-current", "step");
  await expect(guide(page).getByRole("button", { name: "上一步" })).toHaveCount(0);
  await expect(guide(page).getByRole("button", { name: "下一步" })).toBeFocused();

  await guide(page).getByRole("button", { name: "下一步" }).click();
  await expect(guide(page).getByRole("heading")).toHaveText("图片：常发的图存起来");
  await expect(dots(page).nth(1)).toHaveAttribute("aria-current", "step");
  await expect(dots(page).nth(0)).not.toHaveAttribute("aria-current", "step");

  await guide(page).getByRole("button", { name: "上一步" }).click();
  await expect(guide(page).getByRole("heading")).toHaveText("话术：常用回复，一键复制");
  // 上一步 is gone on the first page; focus stays in the dialog.
  await expect(guide(page).getByRole("button", { name: "下一步" })).toBeFocused();

  await dots(page).nth(2).click();
  await expect(guide(page).getByRole("heading")).toHaveText("账号：密码和验证码放这里");
  await expect(guide(page)).toContainText("3 / 4");

  // The background cannot be used while the guide is open.
  await expect(page.locator(".app-shell")).toHaveAttribute("inert", "");

  // Esc closes it like the other dialogs.
  await page.keyboard.press("Escape");
  await expect(guide(page)).toHaveCount(0);
  await expect(page.locator(".app-shell")).not.toHaveAttribute("inert", "");
});

test("跳过 closes the guide and it does not come back after a reload", async ({ page }) => {
  await freshStart(page);
  await guide(page).getByRole("button", { name: "跳过" }).click();
  await expect(guide(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("clipbox.first-run-guide.v1"))).toBe("1");
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.waitForTimeout(500);
  await expect(guide(page)).toHaveCount(0);
});

test("开始使用 on the last page closes it; the close button too", async ({ page }) => {
  await freshStart(page);
  for (let i = 0; i < 3; i += 1) await guide(page).getByRole("button", { name: "下一步" }).click();
  await expect(guide(page).getByRole("heading")).toHaveText("迷你窗口和备份");
  await expect(guide(page).getByRole("button", { name: "下一步" })).toHaveCount(0);
  await guide(page).getByRole("button", { name: "开始使用" }).click();
  await expect(guide(page)).toHaveCount(0);

  // A second visit (as from 设置) closes with the × button as well.
  await page.evaluate(() => localStorage.removeItem("clipbox.first-run-guide.v1"));
  await page.reload();
  await expect(guide(page)).toBeVisible();
  await guide(page).getByRole("button", { name: "关闭使用说明" }).click();
  await expect(guide(page)).toHaveCount(0);
});

test("设置 → 关于 → 再看一遍 opens the guide again from the first page", async ({ page }) => {
  await freshStart(page);
  await guide(page).getByRole("button", { name: "跳过" }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const settings = page.locator(".settings-dialog");
  await settings.getByRole("tab", { name: "关于" }).click();
  const row = settings.locator(".settings-row", { hasText: "使用说明" });
  await row.getByRole("button", { name: "再看一遍" }).click();
  await expect(settings).toHaveCount(0);
  await expect(guide(page)).toBeVisible();
  await expect(guide(page)).toContainText("1 / 4");
  await guide(page).getByRole("button", { name: "跳过" }).click();
  await expect(guide(page)).toHaveCount(0);
  // Focus goes back to the 设置 button, not lost.
  await expect(page.getByRole("button", { name: "设置", exact: true })).toBeFocused();
});

test("Windows: the last page says where the window goes when closed", async ({ page }) => {
  await asDesktop(page, "win32");
  await freshStart(page);
  await dots(page).nth(3).click();
  await expect(guide(page)).toContainText("右下角的托盘");
});

test("macOS: the last page names the menu bar instead", async ({ page }) => {
  await asDesktop(page, "darwin");
  await freshStart(page);
  await dots(page).nth(3).click();
  await expect(guide(page)).toContainText("菜单栏");
  await expect(guide(page)).not.toContainText("托盘");
});

test("not shown in the mini window; it waits until the full window opens", async ({ page }) => {
  await asDesktop(page, "win32");
  // The desktop shell starts this window in mini mode (as when called up from the tray first).
  await page.addInitScript(() => {
    window.clipboxDesktop.onWindowMode = (callback) => { window.__setWindowMode = callback; callback("mini"); return () => {}; };
  });
  await page.goto("/");
  await page.waitForSelector(".app-shell.mini");
  await page.waitForTimeout(600);
  await expect(guide(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("clipbox.first-run-guide.v1"))).toBeNull();
  await page.evaluate(() => window.__setWindowMode("full"));
  await expect(guide(page)).toBeVisible();
});
