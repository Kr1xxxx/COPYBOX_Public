import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

async function openVault(page) {
  await asDesktop(page, "darwin");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.getByRole("dialog", { name: "设置" }).getByRole("tab", { name: "关于" }).click();
  for (let i = 0; i < 5; i += 1) await page.getByRole("dialog", { name: "设置" }).getByText(/^Clipbox v/).click();
  const dialog = page.getByRole("dialog", { name: "保险箱" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function addLogin(dialog, { name, url, user, pass }) {
  await dialog.getByRole("button", { name: "账号密码", exact: true }).click();
  await dialog.getByRole("button", { name: "添加账号密码" }).click();
  await dialog.getByPlaceholder("例如：Shopify 后台").fill(name);
  if (url) await dialog.getByPlaceholder("shopify.com").fill(url);
  await dialog.getByLabel("用户名 / 邮箱").fill(user);
  await dialog.getByLabel("密码", { exact: true }).fill(pass);
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: new RegExp(name) })).toBeVisible(); // saved (encryption takes a moment)
}

test("账号密码: add, hold to show, copy, generate a password, and the 全部 tab groups by website and by type", async ({ page }) => {
  const dialog = await openVault(page);
  await expect(dialog).toContainText("保险箱还是空的");
  await addLogin(dialog, { name: "Shopify 后台", url: "admin.shopify.com", user: "boss@example.com", pass: "s3cret!Pass" });
  // The password is hidden until the eye button is held.
  await expect(dialog).toContainText("••••••••••");
  await expect(dialog).not.toContainText("s3cret!Pass");
  const eye = dialog.getByRole("button", { name: "显示密码" });
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
  await dialog.getByRole("button", { name: "添加账号密码" }).click();
  await dialog.getByPlaceholder("例如：Shopify 后台").fill("某供应商");
  await dialog.getByLabel("用户名 / 邮箱").fill("me");
  await dialog.getByRole("button", { name: "生成密码" }).click();
  await expect(dialog.getByLabel("密码", { exact: true })).toHaveValue(/^.{16}$/);
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: /某供应商/ })).toBeVisible();
  // 全部: by website (default), Shopify has both logins under it.
  await dialog.getByRole("button", { name: "全部", exact: true }).click();
  const shopify = dialog.getByRole("region", { name: "Shopify" });
  await expect(shopify).toContainText("Shopify 后台");
  await expect(shopify).toContainText("Shopify 备用号");
  await expect(shopify.locator(".vault-count")).toHaveText("2");
  await expect(dialog.getByRole("region", { name: "某供应商" })).toBeVisible();
  // By type: one group.
  await dialog.getByRole("radio", { name: "按类型" }).or(dialog.getByRole("button", { name: "按类型" })).click();
  await expect(dialog.getByRole("region", { name: "账号密码" })).toContainText("某供应商");
  // Clicking an entry opens it in its own tab, expanded.
  await dialog.getByRole("button", { name: /Shopify 后台/ }).click();
  await expect(dialog.getByRole("button", { name: "复制密码" })).toBeVisible();
});

test("账号密码: the same password is flagged, a linked 验证码 shows its code, and the overview mixes all types by site", async ({ page }) => {
  const dialog = await openVault(page);
  await dialog.getByRole("button", { name: "验证码", exact: true }).click();
  await dialog.getByRole("button", { name: "添加账号" }).click();
  await dialog.getByLabel("密钥或链接").fill("otpauth://totp/Google:me@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Google");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: "复制 Google 的验证码" })).toBeVisible();
  await addLogin(dialog, { name: "Google 账号", url: "google.com", user: "me@example.com", pass: "Same-pass-1" });
  await dialog.getByRole("button", { name: "添加账号密码" }).click();
  await dialog.getByPlaceholder("例如：Shopify 后台").fill("Gmail 备用");
  await dialog.getByLabel("密码", { exact: true }).fill("Same-pass-1");
  await expect(dialog).toContainText("建议换一个");
  await dialog.locator("select").selectOption({ index: 1 });
  await dialog.getByLabel("用户名 / 邮箱").fill("spare@example.com");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: "复制验证码" })).toBeVisible();
  await expect(dialog.locator(".login-code")).toContainText(/\d{3} \d{3}/);
  // 全部 by website: Google holds the 验证码 and both logins, each marked with its type.
  await dialog.getByRole("button", { name: "全部", exact: true }).click();
  const google = dialog.getByRole("region", { name: "Google" });
  await expect(google.locator(".vault-type-chip")).toHaveText(["密码", "密码", "验证码"]);
});
