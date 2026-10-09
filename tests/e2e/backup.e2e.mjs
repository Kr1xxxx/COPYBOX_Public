import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

async function openSettings(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  return page.getByRole("dialog", { name: "设置" });
}

test("Windows: 备注 can be exported to its own encrypted file and imported back", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await page.getByRole("button", { name: "备注" }).first().click();
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await editor.locator("input").first().fill("公司地址");
  await editor.locator("textarea").first().fill("台北市信义区 123 号");
  await editor.locator(".editor-save").first().click();
  await expect(page.locator(".native-row")).toHaveCount(1);

  const settings = await openSettings(page);
  await settings.locator(".settings-row", { hasText: "导出备注备份" }).getByRole("button", { name: "导出…" }).click();
  const dialog = page.getByRole("dialog", { name: "导出备注备份" });
  await expect(dialog).toContainText("只备份备注");
  await dialog.getByPlaceholder("至少 8 个字符").fill("notes-backup-1");
  await dialog.getByPlaceholder("确认备份密码").fill("notes-backup-1");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "加密并导出" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^clipbox-notes-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const backup = JSON.parse(readFileSync(file, "utf8"));
  expect(backup).toMatchObject({ format: "clipbox-secure-backup", version: 3, scope: "secret" });
  expect(readFileSync(file, "utf8")).not.toContain("台北市");
  await expect(page.locator(".toast, [role=status]").filter({ hasText: "备注备份已导出" }).first()).toBeVisible();

  // Move the note to the trash, then restore it with 覆盖: only 备注 is replaced, the 34 snippets stay.
  await page.getByRole("button", { name: "更多操作 公司地址" }).click();
  await page.getByRole("menuitem", { name: "移到回收站" }).click();
  await expect(page.locator(".native-row")).toHaveCount(0);

  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), (await openSettings(page)).locator(".settings-row", { hasText: "导入备份" }).getByRole("button").click()]);
  await chooser.setFiles(file);
  const importDialog = page.getByRole("dialog", { name: "导入备份" });
  await importDialog.getByPlaceholder("输入导出时设置的密码").fill("notes-backup-1");
  await importDialog.getByRole("button", { name: /覆盖/ }).first().click();
  await importDialog.getByRole("button", { name: "验证并覆盖" }).click();
  await expect(importDialog).toHaveCount(0);
  await page.getByRole("button", { name: "备注" }).first().click();
  await expect(page.locator(".native-row")).toContainText(["公司地址"]);
  await page.getByRole("button", { name: "话术" }).first().click();
  await expect(page.locator(".native-row")).toHaveCount(34);
});

test("the snippet backup still leaves 备注 out", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  const settings = await openSettings(page);
  await settings.locator(".settings-row", { hasText: "导出话术备份" }).getByRole("button", { name: "导出…" }).click();
  const dialog = page.getByRole("dialog", { name: "导出话术备份" });
  await expect(dialog).toContainText("只备份话术");
  await expect(dialog).toContainText("备注不会包含在文件中");
  await dialog.getByPlaceholder("至少 8 个字符").fill("snippet-backup-1");
  await dialog.getByPlaceholder("确认备份密码").fill("snippet-backup-1");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "加密并导出" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^clipbox-snippets-/);
  expect(JSON.parse(readFileSync(await download.path(), "utf8")).scope).toBe("snippet");
});
