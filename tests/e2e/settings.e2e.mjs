import { expect, test } from "@playwright/test";
import { seedSnippets } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await seedSnippets(page);
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.waitForSelector(".settings-dialog");
});

test("folders can be drag-sorted in Settings; standard folders cannot", async ({ page }) => {
  const dialog = page.locator(".settings-dialog");
  // The first group is 话术; the second one (备注/账号) is only on macOS, so the browser and Windows have one group.
  await dialog.getByRole("tab", { name: "目录" }).click();
  const group = dialog.locator(".settings-folder-group").nth(0);
  await group.getByRole("button", { name: /话术目录/ }).click();
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
  // The standard folders can be sorted too (D-035), but not renamed or deleted.
  const standardRow = dialog.locator(".settings-folder", { hasText: "询盘接待" });
  await expect(standardRow.locator("button.settings-folder-grip")).toHaveCount(1);
  await expect(standardRow.getByRole("button", { name: /^(改名|删除)/ })).toHaveCount(0);
});

test("AI settings: empty prompts cannot be saved; presets fill URL and model", async ({ page }) => {
  const dialog = page.locator(".settings-dialog");
  await dialog.getByRole("tab", { name: "AI" }).click();
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

test("目录 groups start folded and open on click; 图片目录 can be created, renamed and deleted here", async ({ page }) => {
  const dialog = page.locator(".settings-dialog");
  await dialog.getByRole("tab", { name: "目录" }).click();
  const groups = dialog.locator(".settings-folder-group");
  // Browser and Windows: 话术目录 and 图片目录 (备注/账号 is only on macOS).
  await expect(groups).toHaveCount(2);
  for (const title of ["话术目录", "图片目录"]) {
    await expect(dialog.getByRole("button", { name: new RegExp(title) })).toHaveAttribute("aria-expanded", "false");
  }
  await expect(dialog.getByRole("button", { name: "新建目录" }).first()).toBeHidden();

  const images = groups.nth(1);
  const trigger = images.getByRole("button", { name: /图片目录/ });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(images).toContainText("还没有目录");
  await images.getByRole("button", { name: "新建目录" }).click();
  await images.locator("input[aria-label^=新建]").fill("产品图");
  await page.keyboard.press("Enter");
  await expect(images.locator(".settings-folder-name")).toHaveText(["产品图"]);
  await expect(images.locator(".settings-folder-count")).toHaveText("0 张");
  // 图片目录 can be sorted now (owner, 2026-10-10): every folder has a drag grip, like 话术目录.
  await expect(images.locator("button.settings-folder-grip")).toHaveCount(1);

  await images.getByRole("button", { name: "改名" }).click();
  await images.locator("input[aria-label^=重命名]").fill("新品图");
  await page.keyboard.press("Enter");
  await expect(images.locator(".settings-folder-name")).toHaveText(["新品图"]);

  // A duplicate name is refused next to the form.
  await images.getByRole("button", { name: "新建目录" }).click();
  await images.locator("input[aria-label^=新建]").fill("新品图");
  await page.keyboard.press("Enter");
  await expect(dialog.locator(".settings-error")).toBeVisible();
  await images.getByRole("button", { name: "取消" }).click();

  // The 图片 sidebar sees the same folder.
  await dialog.getByRole("button", { name: "关闭设置" }).click();
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(page.locator(".sidebar .directory-row", { hasText: "新品图" })).toBeVisible();

  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.locator(".settings-dialog").getByRole("tab", { name: "目录" }).click();
  const again = page.locator(".settings-dialog .settings-folder-group").nth(1);
  await again.getByRole("button", { name: /图片目录/ }).click();
  await again.getByRole("button", { name: "删除" }).click();
  await again.getByRole("button", { name: "确认删除" }).click();
  await expect(again).toContainText("还没有目录");

  // Folding closes it again.
  await again.getByRole("button", { name: /图片目录/ }).click();
  await expect(again.getByRole("button", { name: "新建目录" })).toBeHidden();
});

test("回收站 auto-cleanup starts at 7 days", async ({ page }) => {
  await page.locator(".settings-dialog").getByRole("tab", { name: "数据" }).click();
  const radios = page.locator(".settings-dialog").getByRole("radiogroup", { name: "回收站自动清理" });
  await expect(radios.getByRole("radio", { name: "7 天" })).toHaveAttribute("aria-checked", "true");
});

test("Settings has two columns: groups on the left, the chosen group on the right, 外观 first", async ({ page }) => {
  const dialog = page.locator(".settings-dialog");
  const tabs = dialog.getByRole("tab");
  await expect(tabs).toHaveText(["外观", "目录", "数据", "使用排行", "窗口", "AI", "关于"]);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  // Only the chosen group is shown.
  await expect(dialog.getByRole("radiogroup", { name: "主题" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "导入备份" })).toBeHidden();
  await dialog.getByRole("tab", { name: "数据" }).click();
  await expect(dialog.getByText("导入备份")).toBeVisible();
  await expect(dialog.getByRole("radiogroup", { name: "回收站自动清理" })).toBeVisible();
  await expect(dialog.getByRole("radiogroup", { name: "主题" })).toBeHidden();
  // No jargon in the security note, apart from the one line the owner asked for word for word (2026-10-13).
  await expect(dialog).not.toContainText(/PBKDF2/);
  await expect(dialog).toContainText("内容用 AES-256 加密，只保存在这台设备上");
  // Arrow keys move between groups.
  await dialog.getByRole("tab", { name: "数据" }).press("ArrowDown");
  await expect(dialog.getByRole("tab", { name: "使用排行" })).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("tab", { name: "使用排行" }).press("ArrowDown");
  await expect(dialog.getByRole("tab", { name: "窗口" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByText("迷你模式")).toBeVisible();
});
