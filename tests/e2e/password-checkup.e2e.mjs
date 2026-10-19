import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { accountAddButton, asDesktop, openAccountCategory } from "./helpers.mjs";

test("密码体检 lists a short password and opens it; 导出账号表格 warns first, then saves a CSV", async ({ page }) => {
  await asDesktop(page, "darwin");
  await page.addInitScript(() => { if (!sessionStorage.getItem("__kept")) { localStorage.removeItem("clipbox.vault.samples.v2"); sessionStorage.setItem("__kept", "1"); } });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const vault = page.getByRole("region", { name: "保险箱" });
  await expect(vault.locator(".vault-entry").first()).toBeVisible();

  await page.getByRole("button", { name: "密码体检" }).click();
  await expect(vault).toContainText("没有发现问题");

  await openAccountCategory(page, "登录");
  await accountAddButton(page).click();
  await vault.getByLabel("名称").fill("短密码网站");
  await vault.getByLabel("用户名 / 邮箱").fill("me@example.com");
  await vault.getByLabel("密码", { exact: true }).fill("abc123");
  await vault.getByRole("button", { name: "保存" }).click();
  await expect(vault.getByText("短密码网站")).toBeVisible();

  await page.getByRole("button", { name: "密码体检" }).click();
  const short = vault.getByRole("region", { name: "少于 10 位" });
  await expect(short).toContainText("短密码网站");
  await short.getByRole("button", { name: /短密码网站/ }).click();
  await expect(vault.getByRole("button", { name: "修改" })).toBeVisible();

  await page.getByRole("button", { name: /设置/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("tab", { name: "数据" }).click();
  await dialog.locator(".settings-row", { hasText: "导出账号表格" }).getByRole("button", { name: "导出…" }).click();
  await expect(dialog).toContainText("这个文件没有加密");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "仍然导出" }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const csv = readFileSync(await download.path(), "utf8");
  expect(csv).toContain("类型,名称,网址,用户名,密码或密钥,备注");
  expect(csv).toContain("登录,短密码网站,,me@example.com,abc123,");
});
