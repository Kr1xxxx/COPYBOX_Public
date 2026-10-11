import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function open(page, fetchSiteIcon, arg) {
  await asDesktop(page, "darwin");
  await page.addInitScript(fetchSiteIcon, arg);
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.getByRole("dialog", { name: "设置" }).getByRole("tab", { name: "关于" }).click();
  for (let i = 0; i < 5; i += 1) await page.getByRole("dialog", { name: "设置" }).getByText(/^Clipbox v/).click();
  const dialog = page.getByRole("dialog", { name: "保险箱" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function addLogin(dialog, name, url) {
  await dialog.getByRole("button", { name: "账号密码", exact: true }).click();
  await dialog.getByRole("button", { name: "添加账号密码" }).click();
  await dialog.getByPlaceholder("例如：Shopify 后台").fill(name);
  await dialog.getByPlaceholder("shopify.com").fill(url);
  await dialog.getByLabel("用户名 / 邮箱").fill("boss@example.com");
  await dialog.getByLabel("密码", { exact: true }).fill("s3cret!Pass");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: new RegExp(name) })).toBeVisible();
}

test("a site's own icon is fetched once, shown, kept encrypted and not fetched again; a site without one keeps its initial", async ({ page }) => {
  const dialog = await open(page, (png) => {
    window.__iconCalls = [];
    window.clipboxDesktop.fetchSiteIcon = async (host) => { window.__iconCalls.push(host); return host === "foo-shop.com" ? png : ""; };
  }, PNG);
  await addLogin(dialog, "进货站", "https://www.foo-shop.com/login");
  await expect(dialog.locator(".site-badge-fetched img").first()).toBeVisible();
  const afterFirst = await page.evaluate(() => localStorage.getItem("clipbox.site-icons.v1"));
  await addLogin(dialog, "没图标站", "bar-nothing.com");
  await expect.poll(() => page.evaluate(() => window.__iconCalls)).toEqual(["foo-shop.com", "bar-nothing.com"]);
  await expect(dialog.locator(".site-badge", { hasText: "B" })).toBeVisible();
  // The second answer is saved a moment after it arrives; wait for that before restarting.
  await expect.poll(() => page.evaluate(() => localStorage.getItem("clipbox.site-icons.v1"))).not.toBe(afterFirst);
  const stored = await page.evaluate(() => localStorage.getItem("clipbox.site-icons.v1"));
  expect(stored).toBeTruthy();
  expect(stored).not.toContain("iVBOR");
  expect(stored).not.toContain("foo-shop");

  // After a restart nothing is asked again and the icon is still there.
  await page.evaluate(() => { window.__iconCalls = []; });
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "秘密" }).click();
  await page.locator(".toolbar").getByRole("button", { name: "保险箱" }).click();
  const again = page.getByRole("dialog", { name: "保险箱" });
  await again.getByRole("button", { name: "账号密码", exact: true }).click();
  await expect(again.locator(".site-badge-fetched img").first()).toBeVisible();
  expect(await page.evaluate(() => window.__iconCalls)).toEqual([]);
});
