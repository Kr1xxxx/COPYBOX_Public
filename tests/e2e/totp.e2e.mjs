import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

async function open(page, platform) {
  await asDesktop(page, platform);
  await page.goto("/");
  await page.waitForSelector(".app-shell");
}

async function tapVersion(page, times = 5) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.getByRole("dialog", { name: "设置" }).getByRole("tab", { name: "关于" }).click();
  for (let i = 0; i < times; i += 1) await page.getByRole("dialog", { name: "设置" }).getByText(/^Clipbox v/).click();
}

test("Mac: tapping the version 5 times opens the hidden 验证码, accounts are kept and copy works", async ({ page }) => {
  await open(page, "darwin");
  await expect(page.locator(".kind-switch button")).toHaveText(["话术", "秘密", "图片"]);
  await tapVersion(page);
  const dialog = page.getByRole("dialog", { name: "验证码" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "添加账号" }).click();
  await dialog.getByLabel("密钥或链接").fill("not a secret!");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("alert")).toContainText("密钥不对");
  await dialog.getByLabel("密钥或链接").fill("JBSW Y3DP EHPK 3PXP");
  await dialog.getByLabel("名称（可不填）").fill("公司邮箱");
  await dialog.getByRole("button", { name: "保存" }).click();
  const row = dialog.getByRole("button", { name: "复制 公司邮箱 的验证码" });
  await expect(row).toContainText(/\d{3} \d{3}/);
  await row.click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toMatch(/^\d{6}$/);
  await expect(dialog.locator(".totp-main.copied")).toBeVisible();
  // Saved secrets are not readable in storage.
  const stored = await page.evaluate(() => localStorage.getItem("clipbox.totp.v1"));
  expect(stored).toBeTruthy();
  expect(stored).not.toContain("JBSWY3DPEHPK3PXP");
  await page.reload();
  await page.waitForSelector(".app-shell");
  await expect(page.locator(".kind-switch button")).toHaveText(["话术", "秘密", "图片", "验证码"]);
  await page.locator(".kind-switch").getByRole("button", { name: "验证码" }).click();
  await expect(page.getByRole("dialog", { name: "验证码" }).getByRole("button", { name: "复制 公司邮箱 的验证码" })).toBeVisible();
});

test("Mac: 隐藏入口 removes the tab again", async ({ page }) => {
  await open(page, "darwin");
  await tapVersion(page);
  const dialog = page.getByRole("dialog", { name: "验证码" });
  await dialog.getByRole("button", { name: "隐藏入口" }).click();
  await dialog.getByRole("button", { name: "确认隐藏" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".kind-switch button")).toHaveText(["话术", "秘密", "图片"]);
});

test("Mac: fewer than 5 taps do nothing; Windows never gets the feature", async ({ page }) => {
  await open(page, "darwin");
  await tapVersion(page, 4);
  await expect(page.getByRole("dialog", { name: "验证码" })).toHaveCount(0);
  await page.close();
});

test("Windows: tapping the version does nothing", async ({ page }) => {
  await open(page, "win32");
  await tapVersion(page, 6);
  await expect(page.getByRole("dialog", { name: "验证码" })).toHaveCount(0);
  await expect(page.locator(".kind-switch button")).toHaveText(["话术", "图片"]);
});

test("关于 shows the version and when it was updated; the version still opens 验证码 after 5 taps", async ({ page }) => {
  await open(page, "darwin");
  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "关于" }).click();
  await expect(settings.getByText("Clipbox v0.0.0-test")).toBeVisible();
  const row = settings.locator(".settings-row", { hasText: "更新时间" });
  await expect(row).toContainText("2026-10-10 21:37");
  for (let i = 0; i < 5; i += 1) await settings.getByText(/^Clipbox v/).click();
  await expect(page.getByRole("dialog", { name: "验证码" })).toBeVisible();
});
