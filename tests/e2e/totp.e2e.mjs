import { expect, test } from "@playwright/test";
import { accountAddButton, asDesktop, openAccountCategory } from "./helpers.mjs";

async function open(page, platform) {
  await asDesktop(page, platform);
  await page.goto("/");
  await page.waitForSelector(".app-shell");
}

async function tapVersion(page) {
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
}

test("Mac: the 账号 page is the 保险箱, accounts are kept and copy works", async ({ page }) => {
  await open(page, "darwin");
  await expect(page.locator(".kind-switch button")).toHaveText(["话术", "账号", "图片"]);
  await tapVersion(page);
  const dialog = page.getByRole("region", { name: "保险箱" });
  await expect(dialog).toBeVisible();
  await openAccountCategory(dialog.page(), "验证码");
  await accountAddButton(dialog.page()).click();
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
  await expect(page.locator(".kind-switch button")).toHaveText(["话术", "账号", "图片"]);
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await openAccountCategory(page, "验证码");
  await expect(page.getByRole("region", { name: "保险箱" }).getByRole("button", { name: "复制验证码 公司邮箱" })).toBeVisible();
});

test("Mac: only three sections; the 保险箱 sits inside 账号, no hidden unlock", async ({ page }) => {
  await open(page, "darwin");
  await expect(page.locator(".kind-switch button")).toHaveText(["话术", "账号", "图片"]);
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await expect(page.getByRole("region", { name: "保险箱" })).toBeVisible();
});

test("Windows: no 账号 page, so no 保险箱", async ({ page }) => {
  await open(page, "win32");
  await expect(page.getByRole("region", { name: "保险箱" })).toHaveCount(0);
  await expect(page.locator(".kind-switch button")).toHaveText(["话术", "图片"]);
});

test("关于 shows the version and when it was updated; tapping the version opens nothing", async ({ page }) => {
  await open(page, "darwin");
  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "关于" }).click();
  await expect(settings.getByText("Clipbox v0.0.0-test")).toBeVisible();
  const row = settings.locator(".settings-row", { hasText: "更新时间" });
  await expect(row).toContainText("2026-10-10 21:37");
  for (let i = 0; i < 5; i += 1) await settings.getByText(/^Clipbox v/).click();
  await expect(page.getByRole("region", { name: "保险箱" })).toHaveCount(0);
});


test("Mac: a QR picture fills in the link; unreadable pictures say so", async ({ page }) => {
  await page.addInitScript(() => {
    window.BarcodeDetector = class {
      async detect() {
        return window.__qrText ? [{ rawValue: window.__qrText }] : [];
      }
    };
    window.createImageBitmap = async () => ({ close() {} });
  });
  await open(page, "darwin");
  await tapVersion(page);
  const dialog = page.getByRole("region", { name: "保险箱" });
  await openAccountCategory(dialog.page(), "验证码");
  await accountAddButton(dialog.page()).click();
  const png = { name: "qr.png", mimeType: "image/png", buffer: Buffer.from("x") };
  await dialog.getByLabel("选二维码图片").setInputFiles(png);
  await expect(dialog.getByRole("alert")).toBeVisible();
  await page.evaluate(() => { window.__qrText = "otpauth://totp/Example:bob?secret=JBSWY3DPEHPK3PXP&issuer=Example"; });
  await dialog.getByLabel("选二维码图片").setInputFiles(png);
  await expect(dialog.getByLabel("密钥或链接")).toHaveValue(/^otpauth:\/\/totp\//);
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: /复制 Example/ })).toBeVisible();
});

test("Mac: copying a code with few seconds left says so", async ({ page }) => {
  await page.addInitScript(() => {
    // Freeze the clock 27 s into a 30 s period so exactly 3 s are left, however slow the page is to load.
    const frozen = Math.floor(Date.now() / 30000) * 30000 + 27000;
    Date.now = () => frozen;
  });
  await open(page, "darwin");
  await tapVersion(page);
  const dialog = page.getByRole("region", { name: "保险箱" });
  await openAccountCategory(dialog.page(), "验证码");
  await accountAddButton(dialog.page()).click();
  await dialog.getByLabel("密钥或链接").fill("JBSWY3DPEHPK3PXP");
  await dialog.getByLabel("名称（可不填）").fill("急用");
  await dialog.getByRole("button", { name: "保存" }).click();
  await dialog.getByRole("button", { name: "复制 急用 的验证码" }).click();
  await expect(page.getByText(/只剩 \d 秒/)).toBeVisible();
});
