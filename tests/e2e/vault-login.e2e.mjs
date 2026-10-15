import { expect, test } from "@playwright/test";
import { accountAddButton, asDesktop, openAccountCategory } from "./helpers.mjs";

const openAll = (page) => page.getByRole("navigation", { name: "快捷入口" }).getByRole("button", { name: /^全部/ }).click();

async function openVault(page) {
  await asDesktop(page, "darwin");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const dialog = page.getByRole("region", { name: "保险箱" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function addLogin(dialog, { name, url, user, pass }) {
  await openAccountCategory(dialog.page(), "登录");
  await accountAddButton(dialog.page()).click();
  await dialog.getByPlaceholder("例如：Shopify 后台").fill(name);
  if (url) await dialog.getByPlaceholder("shopify.com").fill(url);
  await dialog.getByLabel("用户名 / 邮箱").fill(user);
  await dialog.getByLabel("密码", { exact: true }).fill(pass);
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: new RegExp(name) })).toBeVisible(); // saved (encryption takes a moment)
}

test("账号密码: add, hold to show, copy, generate a password, and the 全部 tab groups by website and by type", async ({ page }) => {
  const dialog = await openVault(page);
  await expect(dialog).toContainText("还没有账号");
  await addLogin(dialog, { name: "Shopify 后台", url: "admin.shopify.com", user: "boss@example.com", pass: "s3cret!Pass" });
  // The password is hidden; 「按住显示」 shows it only while held, 「显示」 keeps it shown until clicked again.
  await expect(dialog).toContainText("••••••••••");
  await expect(dialog).not.toContainText("s3cret!Pass");
  const toggle = dialog.getByRole("button", { name: "显示密码", exact: true });
  await expect(toggle).toHaveText("显示");
  await toggle.click();
  await expect(dialog).toContainText("s3cret!Pass");
  await page.waitForTimeout(300);
  await expect(dialog).toContainText("s3cret!Pass");
  const hideButton = dialog.getByRole("button", { name: "隐藏密码", exact: true });
  await expect(hideButton).toHaveAttribute("aria-pressed", "true");
  await hideButton.click();
  await expect(dialog).not.toContainText("s3cret!Pass");
  // Left shown, then the entry is folded and opened again: it is hidden again.
  await toggle.click();
  await expect(dialog).toContainText("s3cret!Pass");
  await dialog.getByRole("button", { name: /Shopify 后台/ }).click();
  await dialog.getByRole("button", { name: /Shopify 后台/ }).click();
  await expect(dialog).not.toContainText("s3cret!Pass");
  const eye = dialog.getByRole("button", { name: "按住显示密码" });
  await expect(eye).toHaveText("按住显示");
  const box = await eye.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(dialog).toContainText("s3cret!Pass");
  await page.mouse.up();
  await expect(dialog).not.toContainText("s3cret!Pass");
  await dialog.getByRole("button", { name: "复制密码" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("s3cret!Pass");
  await dialog.getByRole("button", { name: "复制用户名" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("boss@example.com");
  // Stored encrypted.
  const stored = await page.evaluate(() => localStorage.getItem("clipbox.vault-items.v1"));
  expect(stored).not.toContain("s3cret");
  expect(stored).not.toContain("shopify");
  // A second login for the same site, and one for another site.
  await addLogin(dialog, { name: "Shopify 备用号", url: "shopify.com", user: "backup@example.com", pass: "s3cret!Pass" });
  await accountAddButton(page).click();
  await dialog.getByPlaceholder("例如：Shopify 后台").fill("某供应商");
  await dialog.getByLabel("用户名 / 邮箱").fill("me");
  await dialog.getByRole("button", { name: "生成密码" }).click();
  await expect(dialog.getByLabel("密码", { exact: true })).toHaveValue(/^.{16}$/);
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: /某供应商/ })).toBeVisible();
  // 全部: by website (default), Shopify has both logins under it.
  await openAll(page);
  const shopify = dialog.getByRole("region", { name: "Shopify" });
  await expect(shopify).toContainText("Shopify 后台");
  await expect(shopify).toContainText("Shopify 备用号");
  await expect(shopify.locator(".vault-count")).toHaveText("2");
  await expect(dialog.getByRole("region", { name: "某供应商" })).toBeVisible();
  // Clicking an entry opens it, expanded.
  await dialog.locator(".vault-entry", { hasText: "Shopify 后台" }).click();
  await expect(dialog.getByRole("button", { name: "复制密码" })).toBeVisible();
});

test("账号密码: the same password is flagged, a linked 验证码 shows its code, and the overview mixes all types by site", async ({ page }) => {
  const dialog = await openVault(page);
  await openAccountCategory(page, "验证码");
  await accountAddButton(page).click();
  await dialog.getByLabel("密钥或链接").fill("otpauth://totp/Google:me@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Google");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: "复制 Google 的验证码" })).toBeVisible();
  await addLogin(dialog, { name: "Google 账号", url: "google.com", user: "me@example.com", pass: "Same-pass-1" });
  await openAccountCategory(page, "登录");
  await accountAddButton(page).click();
  await dialog.getByPlaceholder("例如：Shopify 后台").fill("Gmail 备用");
  await dialog.getByLabel("密码", { exact: true }).fill("Same-pass-1");
  await expect(dialog).toContainText("建议换一个");
  await dialog.locator("select").selectOption({ index: 1 });
  await dialog.getByLabel("用户名 / 邮箱").fill("spare@example.com");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: "复制验证码" })).toBeVisible();
  await expect(dialog.locator(".login-code")).toContainText(/\d{3} \d{3}/);
  // 全部 by website: Google holds the 验证码 and both logins, each marked with its type.
  await openAll(page);
  const google = dialog.getByRole("region", { name: "Google" });
  await expect(google.locator(".vault-type-chip")).toHaveText(["登录", "登录", "验证码"]);
});
