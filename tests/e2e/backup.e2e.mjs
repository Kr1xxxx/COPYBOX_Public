import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { asDesktop, openAccountCategory, seedSnippets, openRow } from "./helpers.mjs";

async function openSettings(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("tab", { name: "数据" }).click();
  // The single-part exports and imports sit under 更多 (D-103).
  await dialog.getByText("更多导出和导入").click();
  return dialog;
}

test("macOS: 账号 can be exported to its own encrypted file and imported back", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  await page.getByRole("button", { name: "账号" }).first().click();
  await openAccountCategory(page, "其他");
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await editor.locator("input").first().fill("公司地址");
  await editor.locator("textarea").first().fill("台北市信义区 123 号");
  await editor.locator(".editor-save").first().click();
  await expect(page.locator(".native-row")).toHaveCount(1);

  const settings = await openSettings(page);
  await settings.locator(".settings-row", { hasText: "导出账号备份" }).getByRole("button", { name: "导出…" }).click();
  const dialog = page.getByRole("dialog", { name: "导出账号备份" });
  await expect(dialog).toContainText("只备份账号");
  await dialog.getByPlaceholder("至少 8 个字符").fill("secrets-backup-1");
  await dialog.getByPlaceholder("确认备份密码").fill("secrets-backup-1");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "加密并导出" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^copyboxx-secrets-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const backup = JSON.parse(readFileSync(file, "utf8"));
  expect(backup).toMatchObject({ format: "clipbox-secure-backup", version: 3, scope: "secret" });
  expect(readFileSync(file, "utf8")).not.toContain("台北市");
  await expect(page.locator(".toast, [role=status]").filter({ hasText: "账号备份已导出" }).first()).toBeVisible();

  // Move the entry to the trash, then restore it with 覆盖: only 账号 is replaced, the 34 snippets stay.
  await openRow(page, page.locator(".native-row .row-main", { hasText: "公司地址" }));
  await page.getByRole("button", { name: "更多操作 公司地址" }).click();
  await page.getByRole("menuitem", { name: "移到回收站" }).click();
  await expect(page.locator(".native-row")).toHaveCount(0);

  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), (await openSettings(page)).locator(".settings-row", { hasText: "导入备份" }).getByRole("button").click()]);
  await chooser.setFiles(file);
  const importDialog = page.getByRole("dialog", { name: "导入备份" });
  await importDialog.getByPlaceholder("输入导出时设置的密码").fill("secrets-backup-1");
  await importDialog.getByRole("button", { name: /覆盖/ }).first().click();
  await importDialog.getByRole("button", { name: "验证并覆盖" }).click();
  await expect(importDialog).toHaveCount(0);
  await page.getByRole("button", { name: "账号" }).first().click();
  await openAccountCategory(page, "其他");
  await expect(page.locator(".native-row")).toContainText(["公司地址"]);
  await page.getByRole("button", { name: "话术" }).first().click();
  await expect(page.locator(".native-row")).toHaveCount(34);
});

test("macOS: importing with 合并 brings a trashed 账号 back instead of skipping it", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  await page.getByRole("button", { name: "账号" }).first().click();
  await openAccountCategory(page, "其他");
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await editor.locator("input").first().fill("公司地址");
  await editor.locator("textarea").first().fill("台北市信义区 123 号");
  await editor.locator(".editor-save").first().click();
  await expect(page.locator(".native-row")).toHaveCount(1);

  const settings = await openSettings(page);
  await settings.locator(".settings-row", { hasText: "导出账号备份" }).getByRole("button", { name: "导出…" }).click();
  const dialog = page.getByRole("dialog", { name: "导出账号备份" });
  await dialog.getByPlaceholder("至少 8 个字符").fill("secrets-backup-1");
  await dialog.getByPlaceholder("确认备份密码").fill("secrets-backup-1");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "加密并导出" }).click()]);
  const file = await download.path();

  await openRow(page, page.locator(".native-row .row-main", { hasText: "公司地址" }));
  await page.getByRole("button", { name: "更多操作 公司地址" }).click();
  await page.getByRole("menuitem", { name: "移到回收站" }).click();
  await expect(page.locator(".native-row")).toHaveCount(0);
  const trashBadge = page.locator(".nav-item", { hasText: "回收站" }).locator("b");
  await expect(trashBadge).toHaveText("1");

  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), (await openSettings(page)).locator(".settings-row", { hasText: "导入备份" }).getByRole("button").click()]);
  await chooser.setFiles(file);
  const importDialog = page.getByRole("dialog", { name: "导入备份" });
  await importDialog.getByPlaceholder("输入导出时设置的密码").fill("secrets-backup-1");
  await importDialog.getByRole("button", { name: "验证并合并" }).click();
  await expect(importDialog).toHaveCount(0);
  await page.getByRole("button", { name: "账号" }).first().click();
  await openAccountCategory(page, "其他");
  await expect(page.locator(".native-row")).toContainText(["公司地址"]);
  await expect(page.locator(".native-row")).toHaveCount(1);
  await expect(trashBadge).toHaveCount(0);
});

test("macOS: the snippet backup still leaves 账号 out", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  const settings = await openSettings(page);
  await settings.locator(".settings-row", { hasText: "导出话术备份" }).getByRole("button", { name: "导出…" }).click();
  const dialog = page.getByRole("dialog", { name: "导出话术备份" });
  await expect(dialog).toContainText("只备份话术");
  await expect(dialog).toContainText("账号不会包含在文件中");
  await dialog.getByPlaceholder("至少 8 个字符").fill("snippet-backup-1");
  await dialog.getByPlaceholder("确认备份密码").fill("snippet-backup-1");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "加密并导出" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^copyboxx-snippets-/);
  expect(JSON.parse(readFileSync(await download.path(), "utf8")).scope).toBe("snippet");
});

test("Windows: the snippet backup says nothing about 备注, and 账号备份 is its own row", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  const settings = await openSettings(page);
  await expect(settings.locator(".settings-row", { hasText: /导出.*备份/ })).toHaveCount(2);
  await settings.locator(".settings-row", { hasText: "导出话术备份" }).getByRole("button", { name: "导出…" }).click();
  const dialog = page.getByRole("dialog", { name: "导出话术备份" });
  await expect(dialog).toContainText("只备份话术");
  await expect(dialog).not.toContainText("备注");
});
