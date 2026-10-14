import { test, expect } from "@playwright/test";
import { seedSnippets } from "./helpers.mjs";

test("Settings search finds a setting on another page and says when nothing matches", async ({ page }) => {
  await seedSnippets(page);
  await page.getByRole("button", { name: /设置/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  const search = dialog.getByRole("searchbox", { name: "搜索设置" });
  await search.fill("更新时间");
  await expect(dialog.getByText("更新时间").first()).toBeVisible();
  await search.fill("没有这个设置xyz");
  await expect(dialog.getByText(/没有找到/)).toBeVisible();
  await search.fill("");
  await expect(dialog.getByRole("tab", { name: "概览" })).toHaveAttribute("aria-selected", "true");
});
