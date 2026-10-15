import { expect, test } from "@playwright/test";
import { accountAddButton, asDesktop, openAccountCategory } from "./helpers.mjs";

// Every 账号 row starts with its website's logo: bundled brand glyphs for big sites (found by address, subdomains too),
// the coloured initial for the rest. Nothing is fetched for a bundled site.
test("account rows show a big site's bundled logo, others keep their initial", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.addInitScript(() => {
    window.__iconCalls = [];
    window.clipboxDesktop.fetchSiteIcon = async (host) => { window.__iconCalls.push(host); return ""; };
  });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  for (const [name, url] of [["Instagram 主号", "https://www.instagram.com/accounts/login"], ["邮箱", "mail.google.com"], ["进货站", "foo-shop.com"]]) {
    await openAccountCategory(page, "登录");
    await accountAddButton(page).click();
    await page.getByPlaceholder("例如：Shopify 后台").fill(name);
    await page.getByPlaceholder("shopify.com").fill(url);
    await page.getByLabel("用户名 / 邮箱").fill("boss@example.com");
    await page.getByLabel("密码", { exact: true }).fill("s3cret!Pass");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByRole("button", { name: new RegExp(name) }).first()).toBeVisible();
  }
  await page.getByRole("button", { name: "‹ 返回列表" }).click();
  const row = (name) => page.locator(".acct-row", { hasText: name }).locator(".vault-entry .site-badge");
  await expect(row("Instagram 主号")).toHaveAttribute("aria-label", "Instagram");
  await expect(row("Instagram 主号").locator("svg path")).toHaveCount(1);
  await expect(row("邮箱")).toHaveAttribute("aria-label", "Gmail");
  await expect(row("邮箱").locator("svg path")).toHaveCount(1);
  await expect(row("进货站")).toHaveText("F");
  // Only the unknown site is asked for its own icon (D-031); the big sites come with the app.
  await expect.poll(() => page.evaluate(() => window.__iconCalls)).toEqual(["foo-shop.com"]);
  // The card title repeats the logo only when the rows are folded away.
  await expect(page.locator(".vault-group h3 .site-badge")).toHaveCount(0);
  await page.getByRole("button", { name: "收起账号" }).click();
  await expect(page.locator(".vault-group h3 .site-badge")).toHaveCount(3);
});
