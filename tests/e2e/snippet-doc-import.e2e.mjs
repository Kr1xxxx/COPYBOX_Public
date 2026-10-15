import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

const sample = readFileSync(new URL("../../docs/samples/standard-library-sample.md", import.meta.url));

test("a 话术 document imports with its chapters as folders and [ ] parts as fill-in blocks", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /导入话术表格/ }).first().click(),
  ]);
  await chooser.setFiles({ name: "标准话术库.md", mimeType: "text/markdown", buffer: sample });
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".import-metrics .positive strong")).toHaveText("6");
  await expect(dialog.locator(".import-folder-list span")).toHaveText(["开场接待", "群发", "通用短句"]);
  await dialog.getByRole("button", { name: /导入/ }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const name of ["开场接待", "群发", "通用短句"]) await expect(page.getByRole("button", { name: new RegExp(`^${name}`) }).first()).toBeVisible();
  await page.getByRole("button", { name: /^开场接待/ }).first().click();
  await expect(page.getByText("新询盘").first()).toBeVisible();
  await expect(page.locator("main").getByText("名字", { exact: true }).first()).toBeVisible();
});

test("only .md documents and .xlsx / .csv sheets import; a .txt file is refused with a message", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /导入话术表格/ }).first().click(),
  ]);
  await chooser.setFiles({ name: "话术.txt", mimeType: "text/plain", buffer: sample });
  await expect(page.locator(".toast")).toContainText("只支持 .md 话术文档和 .xlsx / .csv 表格");
  await expect(page.locator("[role=dialog]")).toHaveCount(0);
});
