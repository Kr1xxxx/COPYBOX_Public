import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

async function openSettings(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("tab", { name: "数据" }).click();
  return dialog;
}

test("全部数据可以导出成加密文件，清空后再导入回来", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await expect(page.locator(".native-row")).toHaveCount(34);

  const settings = await openSettings(page);
  await settings.locator(".settings-row", { hasText: "导出到新版" }).getByRole("button", { name: "导出…" }).click();
  const dialog = page.getByRole("dialog", { name: "导出到新版" });
  await dialog.getByPlaceholder("至少 8 个字符").fill("move-1234");
  await dialog.getByPlaceholder("确认密码").fill("move-9999");
  await dialog.getByRole("button", { name: "加密并导出" }).click();
  await expect(dialog).toContainText("两次输入的密码不一致");
  await dialog.getByPlaceholder("确认密码").fill("move-1234");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "加密并导出" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^clipbox-data-move-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const text = readFileSync(file, "utf8");
  expect(JSON.parse(text)).toMatchObject({ format: "clipbox-data-move", version: 1 });
  expect(text).not.toContain("clipbox.vault");
  await expect(dialog).toContainText("已导出");
  await dialog.getByRole("button", { name: "完成" }).click();

  // Throw the data away, as a fresh install would have it.
  await page.evaluate(async () => {
    localStorage.clear();
    for (const name of ["clipbox-images", "clipbox-image-thumbs"]) indexedDB.deleteDatabase(name);
  });
  await page.reload();
  await expect(page.locator(".native-row")).toHaveCount(0);

  const again = await openSettings(page);
  await again.locator(".settings-row", { hasText: "从旧版导入" }).getByRole("button").click();
  const importDialog = page.getByRole("dialog", { name: "从旧版导入" });
  await importDialog.getByLabel("搬家文件").setInputFiles(file);
  await importDialog.getByPlaceholder("输入导出时设置的密码").fill("wrong-password");
  await importDialog.getByRole("button", { name: "验证并替换" }).click();
  await expect(importDialog).toContainText("密码不对");
  await importDialog.getByPlaceholder("输入导出时设置的密码").fill("move-1234");
  await importDialog.getByRole("button", { name: "验证并替换" }).click();
  await expect(page.locator(".native-row")).toHaveCount(34);
});
