import { expect, test } from "@playwright/test";
import { seedSnippets } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await seedSnippets(page);
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.waitForSelector(".settings-dialog");
});

test("设置里可以拖动目录排序，标准目录不能拖", async ({ page }) => {
  const dialog = page.locator(".settings-dialog");
  const group = dialog.locator(".settings-folder-group").nth(1);
  for (const name of ["甲", "乙", "丙"]) {
    await group.getByRole("button", { name: "新建目录" }).click();
    await group.locator("input[aria-label^=新建]").fill(name);
    await page.keyboard.press("Enter");
    await expect(group).toContainText(name);
  }
  const names = () => group.locator(".settings-folder-name").allInnerTexts();
  const before = await names();
  const handle = group.locator(".settings-folder").nth(before.indexOf("甲")).locator(".settings-folder-grip");
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await group.locator(".settings-folder").nth(before.indexOf("丙")).boundingBox();
  await page.mouse.move(from.x + 8, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 30, { steps: 4 });
  await page.mouse.move(from.x + 8, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await names()).indexOf("甲")).toBeGreaterThan(before.indexOf("甲"));
  await expect(dialog.locator(".settings-folder", { hasText: "询盘接待" }).locator("button.settings-folder-grip")).toHaveCount(0);
});

test("AI 设置：提示词为空不能保存，预设会填好地址和模型", async ({ page }) => {
  const dialog = page.locator(".settings-dialog");
  await dialog.locator("#set-ai").scrollIntoViewIfNeeded();
  const save = dialog.getByRole("button", { name: "保存", exact: true });
  await expect(save).toBeDisabled();
  await dialog.getByLabel("常用服务").selectOption({ label: "DeepSeek" });
  await expect(dialog.getByLabel("接口地址")).toHaveValue("https://api.deepseek.com");
  await expect(dialog.getByLabel("模型", { exact: true })).not.toHaveValue("");
  await dialog.getByLabel("API Key").fill("sk-test");
  await expect(save).toBeEnabled();
  await dialog.getByLabel("润色提示词").fill("   ");
  await expect(save).toBeDisabled();
  await expect(dialog.locator(".settings-error")).toContainText("润色提示词不能为空");
  await dialog.getByLabel("润色提示词").fill("润色");
  await dialog.getByLabel("整理提示词").fill("");
  await expect(save).toBeDisabled();
});
