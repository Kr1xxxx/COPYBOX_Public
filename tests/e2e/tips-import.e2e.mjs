import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

const sample = readFileSync(new URL("../../docs/samples/tips-sample.md", import.meta.url));

test("a Tips document imports from 设置 → 数据 and its tips appear in the Tips card", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "数据" }).click();
  await settings.getByLabel("选择 Tips 文件").setInputFiles({ name: "tips.md", mimeType: "text/markdown", buffer: sample });
  await expect(settings.getByRole("status").filter({ hasText: "已导入 Tips" })).toHaveText("已导入 Tips：新增 1 条，更新 1 条");
  await settings.getByLabel("选择 Tips 文件").setInputFiles({ name: "tips.md", mimeType: "text/markdown", buffer: sample });
  await expect(settings.getByRole("status").filter({ hasText: "已导入 Tips" })).toHaveText("已导入 Tips：2 条没有变化");
  await settings.getByLabel("选择 Tips 文件").setInputFiles({ name: "tips.txt", mimeType: "text/plain", buffer: sample });
  await expect(settings.getByRole("status").filter({ hasText: "只支持" })).toHaveText("只支持 .md Tips 文档和 .xlsx / .csv 表格");
  await settings.getByRole("button", { name: "关闭设置" }).click();
  // The first tip shown is still the first company tip, now with the imported text.
  await expect(page.locator(".daily-tips-preview")).toContainText("导入时同名的 Tips 会更新");
});
