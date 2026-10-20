import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";
import { makePng } from "../helpers/png.mjs";

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
  await settings.locator(".settings-row", { hasText: "完整备份" }).getByRole("button", { name: "导出…" }).click();
  const dialog = page.getByRole("dialog", { name: "完整备份" });
  // Esc closes only this dialog; the settings stay open. No English eyebrow text.
  await expect(dialog).not.toContainText("DATA MOVE");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeVisible();
  await settings.locator(".settings-row", { hasText: "完整备份" }).getByRole("button", { name: "导出…" }).click();
  await dialog.getByPlaceholder("至少 8 个字符").fill("move-1234");
  await dialog.getByPlaceholder("确认密码").fill("move-9999");
  await dialog.getByRole("button", { name: "加密并导出" }).click();
  await expect(dialog).toContainText("两次输入的密码不一致");
  await dialog.getByPlaceholder("确认密码").fill("move-1234");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "加密并导出" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^copyboxx-full-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const text = readFileSync(file, "utf8");
  expect(JSON.parse(text)).toMatchObject({ format: "clipbox-data-move", version: 1 });
  expect(text).not.toContain("clipbox.vault");
  await expect(dialog).toContainText("已导出");
  await dialog.getByRole("button", { name: "完成" }).click();

  // Throw the data away, as a fresh install would have it.
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem("clipbox.first-run-guide.v1", "1"); // the guide was seen on this machine; it is not what this test is about
    for (const name of ["clipbox-images", "clipbox-image-thumbs"]) indexedDB.deleteDatabase(name);
  });
  await page.reload();
  await expect(page.locator(".native-row")).toHaveCount(0);

  const again = await openSettings(page);
  await again.locator(".settings-row", { hasText: "从完整备份恢复" }).getByRole("button").click();
  const importDialog = page.getByRole("dialog", { name: "从完整备份恢复" });
  await importDialog.getByLabel("备份文件").setInputFiles(file);
  await importDialog.getByPlaceholder("输入导出时设置的密码").fill("wrong-password");
  await importDialog.getByRole("button", { name: "验证并替换" }).click();
  await expect(importDialog).toContainText("密码不对");
  await importDialog.getByPlaceholder("输入导出时设置的密码").fill("move-1234");
  await importDialog.getByRole("button", { name: "验证并替换" }).click();
  await expect(importDialog.getByRole("alert")).toContainText(/替换现有的 0 条内容、0 张图片/);
  await importDialog.getByRole("button", { name: "确认替换" }).click();
  await expect(page.locator(".native-row")).toHaveCount(34);
});

test("restoring a backup made before images were used removes later images and their thumbnails", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  const settings = await openSettings(page);
  await settings.locator(".settings-row", { hasText: "完整备份" }).getByRole("button", { name: "导出…" }).click();
  const exportDialog = page.getByRole("dialog", { name: "完整备份" });
  await exportDialog.getByPlaceholder("至少 8 个字符").fill("fixture-backup");
  await exportDialog.getByPlaceholder("确认密码").fill("fixture-backup");
  const [download] = await Promise.all([page.waitForEvent("download"), exportDialog.getByRole("button", { name: "加密并导出" }).click()]);
  const file = await download.path();
  await exportDialog.getByRole("button", { name: "完成" }).click();
  await settings.getByRole("button", { name: "关闭设置" }).click();
  await page.locator(".kind-switch").getByRole("button", { name: "图片", exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "新增图片" }).click()]);
  await chooser.setFiles({ name: "后来新增.png", mimeType: "image/png", buffer: makePng(500, 500, [30, 140, 210]) });
  await expect(page.locator(".image-tile")).toHaveCount(1);
  await expect(page.locator(".image-tile-thumb img")).toBeVisible();
  const again = await openSettings(page);
  await again.locator(".settings-row", { hasText: "从完整备份恢复" }).getByRole("button").click();
  const restore = page.getByRole("dialog", { name: "从完整备份恢复" });
  await restore.getByLabel("备份文件").setInputFiles(file);
  await restore.getByPlaceholder("输入导出时设置的密码").fill("fixture-backup");
  await restore.getByRole("button", { name: "验证并替换" }).click();
  await expect(restore.getByRole("alert")).toContainText("1 张图片");
  await restore.getByRole("button", { name: "确认替换" }).click();
  await expect(page.locator(".native-row")).toHaveCount(34);
  await page.locator(".kind-switch").getByRole("button", { name: "图片", exact: true }).click();
  await expect(page.locator(".image-tile")).toHaveCount(0);
  const staleRows = await page.evaluate(async () => {
    const count = (name, store) => new Promise((resolve, reject) => {
      const open = indexedDB.open(name);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(store)) { db.close(); resolve(0); return; }
        const request = db.transaction(store).objectStore(store).count();
        request.onsuccess = () => { db.close(); resolve(request.result); };
        request.onerror = () => { db.close(); reject(request.error); };
      };
    });
    return [await count("clipbox-images", "blobs"), await count("clipbox-image-thumbs", "thumbs")];
  });
  expect(staleRows).toEqual([0, 0]);
});
