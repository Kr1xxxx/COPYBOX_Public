// 回收站「全部删除」: asks first with the count, 取消 keeps everything, 全部删除 removes everything for good.
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { asDesktop, openRow, seedSnippets } from "./helpers.mjs";

const PNG_FILE = fileURLToPath(new URL("../fixtures/sample-gradient.png", import.meta.url));
const trashNav = (page) => page.locator(".nav-footer .nav-item", { hasText: "回收站" });

async function emptyTrash(page, countText) {
  await page.locator(".section-head").getByRole("button", { name: "全部删除" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("全部永久删除？");
  await expect(dialog).toContainText(countText);
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator(".section-head").getByRole("button", { name: "全部删除" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "全部删除" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator(".section-head").getByRole("button", { name: "全部删除" })).toHaveCount(0);
}

test("话术: 全部删除 in the 回收站 removes every trashed snippet, also after a reload", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  for (let i = 0; i < 2; i += 1) {
    await openRow(page, page.locator(".row-main").first());
    await page.getByRole("button", { name: /^更多操作/ }).first().click();
    await page.locator(".row-menu").getByRole("menuitem", { name: "移到回收站" }).click();
  }
  await trashNav(page).click();
  await expect(page.locator(".trash-row")).toHaveCount(2);
  await emptyTrash(page, "2 条内容");
  await expect(page.locator(".toast")).toContainText("已永久删除 2 条");
  await expect(page.locator(".trash-row")).toHaveCount(0);
  await page.reload();
  await page.waitForSelector(".app-shell");
  await trashNav(page).click();
  await expect(page.locator(".trash-row")).toHaveCount(0);
});

test("账号: 全部删除 in the 回收站 removes the trashed entries", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.addInitScript(() => { if (!sessionStorage.getItem("__kept")) { localStorage.removeItem("clipbox.vault.samples.v2"); sessionStorage.setItem("__kept", "1"); } });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const region = page.getByRole("region", { name: "保险箱" });
  await expect(region.locator(".vault-entry").first()).toBeVisible();
  await page.locator(".section-head").getByRole("button", { name: "选择" }).click();
  await page.getByRole("toolbar", { name: "批量操作" }).getByRole("button", { name: "全选" }).click();
  await page.getByRole("toolbar", { name: "批量操作" }).getByRole("button", { name: "移到回收站" }).click();
  await page.getByRole("button", { name: /^回收站/ }).click();
  await expect(region.locator(".vault-entry")).toHaveCount(3);
  await emptyTrash(page, "3 条内容");
  await expect(page.locator(".toast")).toContainText("已永久删除 3 条");
  await expect(region.locator(".vault-entry")).toHaveCount(0);
});

test("图片: 全部删除 in the 回收站 removes every trashed picture", async ({ page }) => {
  await asDesktop(page, "win32", { imageView: "list" });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "新增图片" }).click()]);
  await chooser.setFiles(PNG_FILE);
  await openRow(page, page.locator(".image-row .row-main").first());
  await page.locator(".image-row.selected").getByRole("button", { name: "删除", exact: true }).click();
  await trashNav(page).click();
  await expect(page.locator(".trash-row")).toHaveCount(1);
  await emptyTrash(page, "1 张图片");
  await expect(page.locator(".toast")).toContainText("已永久删除 1 张图片");
  await expect(page.locator("body")).toContainText("回收站是空的");
});
