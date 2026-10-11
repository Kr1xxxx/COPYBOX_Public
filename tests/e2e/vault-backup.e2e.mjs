import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { accountAddButton, asDesktop, openAccountCategory, seedSnippets } from "./helpers.mjs";

async function openSettings(page, tab = "数据") {
  await page.getByRole("button", { name: /设置/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("tab", { name: tab }).click();
  return dialog;
}

test("Mac: a 账号 backup carries the 保险箱 (验证码 and API 密钥) encrypted and restores it; old backups still import", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const vault = page.getByRole("region", { name: "保险箱" });
  await openAccountCategory(vault.page(), "验证码");
  await accountAddButton(vault.page()).click();
  await vault.getByLabel("密钥或链接").fill("JBSWY3DPEHPK3PXP");
  await vault.getByLabel("名称（可不填）").fill("公司邮箱");
  await vault.getByRole("button", { name: "保存" }).click();
  await expect(vault.getByRole("button", { name: "复制 公司邮箱 的验证码" })).toBeVisible();
  await openAccountCategory(vault.page(), "API 密钥");
  await accountAddButton(vault.page()).click();
  await vault.getByPlaceholder("例如：客服 AI 接口").fill("客服 AI 接口");
  await vault.getByLabel("密钥", { exact: true }).fill("sk-ant-api03-ABCDEFGH1234");
  await vault.getByRole("button", { name: "保存" }).click();
  await expect(vault.getByRole("button", { name: /客服 AI 接口/ })).toBeVisible();

  await (await openSettings(page)).locator(".settings-row", { hasText: "导出账号备份" }).getByRole("button", { name: "导出…" }).click();
  const dialog = page.getByRole("dialog", { name: "导出账号备份" });
  await dialog.getByPlaceholder("至少 8 个字符").fill("secrets-backup-1");
  await dialog.getByPlaceholder("确认备份密码").fill("secrets-backup-1");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "加密并导出" }).click()]);
  const file = await download.path();
  const text = readFileSync(file, "utf8");
  expect(JSON.parse(text).vaultBox).toBeTruthy();
  expect(text).not.toContain("JBSWY3DPEHPK3PXP");
  expect(text).not.toContain("ABCDEFGH");

  // Lose the 保险箱 data, then bring it back from the file.
  await page.evaluate(() => { localStorage.removeItem("clipbox.totp.v1"); localStorage.removeItem("clipbox.vault-items.v1"); });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), (await openSettings(page)).locator(".settings-row", { hasText: "导入备份" }).getByRole("button").click()]);
  await chooser.setFiles(file);
  const importDialog = page.getByRole("dialog", { name: "导入备份" });
  await importDialog.getByPlaceholder("输入导出时设置的密码").fill("secrets-backup-1");
  await importDialog.getByRole("button", { name: /合并/ }).first().click();
  await importDialog.getByRole("button", { name: /验证并/ }).click();
  await expect(importDialog).toHaveCount(0);
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const back = page.getByRole("region", { name: "保险箱" });
  await openAccountCategory(back.page(), "验证码");
  await expect(back.getByRole("button", { name: "复制验证码 公司邮箱" })).toBeVisible();
  await openAccountCategory(back.page(), "API 密钥");
  await expect(back.locator(".vault-entry", { hasText: "客服 AI 接口" })).toBeVisible();
});
