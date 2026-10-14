import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

// D-048: own folders can get a short name for the mini window, set from a quiet 「⋯」 in Settings → 目录.

async function openFolderSettings(page, groupTitle) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  const dialog = page.locator(".settings-dialog");
  await dialog.getByRole("tab", { name: "目录" }).click();
  const group = dialog.locator(".settings-folder-group", { has: page.getByRole("button", { name: new RegExp(groupTitle) }) });
  await group.getByRole("button", { name: new RegExp(groupTitle) }).click();
  return { dialog, group };
}

async function addFolder(page, group, name) {
  await group.getByRole("button", { name: "新建目录" }).click();
  await group.locator("input[aria-label^=新建]").fill(name);
  await page.keyboard.press("Enter");
  await expect(group.locator(".settings-folder-name", { hasText: name })).toBeVisible();
}

async function miniFolderTab(page, fullName) {
  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  return page.locator(`.mini-folders .mini-tab[title="${fullName}"]`);
}

async function backToFull(page) {
  await page.getByRole("button", { name: "恢复完整窗口" }).click();
  await page.setViewportSize({ width: 680, height: 620 });
}

test("an own 话术 folder gets a short name in the mini window; 恢复默认 brings back the first two characters", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  const { dialog, group } = await openFolderSettings(page, "话术目录");
  await addFolder(page, group, "客户跟单");

  // Hidden behind a click: the standard folders have no 「⋯」 at all, and nothing shows until it is opened.
  await expect(dialog.locator(".settings-folder", { hasText: "询盘接待" }).getByRole("button", { name: /^更多设置/ })).toHaveCount(0);
  await expect(dialog.locator(".settings-folder-more")).toHaveCount(0);
  const more = group.getByRole("button", { name: "更多设置 客户跟单" });
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const panel = dialog.locator(".settings-folder-more");
  await expect(panel).toContainText("迷你窗口显示为");
  const input = panel.getByRole("textbox", { name: "迷你窗口显示为 客户跟单" });
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("placeholder", "客户");

  // Too long: refused with a plain message, nothing is cut or saved.
  await input.fill("跟单员");
  await panel.getByRole("button", { name: "保存" }).click();
  await expect(panel.getByRole("alert")).toHaveText("最多两个字");
  await expect(input).toHaveValue("跟单员");

  // Esc closes only the panel, not Settings.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(more).toBeFocused();

  await more.click();
  await expect(panel.getByRole("textbox"), "the refused value was not saved").toHaveValue("");
  await panel.getByRole("textbox").fill("跟单");
  await panel.getByRole("button", { name: "保存" }).click();
  await expect(panel).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭设置" }).click();

  let tab = await miniFolderTab(page, "客户跟单");
  await expect(tab).toHaveText("跟单");
  await expect(tab).toHaveAttribute("aria-label", "客户跟单");

  // Kept after a restart.
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.setViewportSize({ width: 680, height: 620 });
  tab = await miniFolderTab(page, "客户跟单");
  await expect(tab).toHaveText("跟单");
  await backToFull(page);

  // The panel opens with the saved value; 恢复默认 goes back to the default.
  const again = await openFolderSettings(page, "话术目录");
  await again.group.getByRole("button", { name: "更多设置 客户跟单" }).click();
  await expect(again.dialog.locator(".settings-folder-more").getByRole("textbox")).toHaveValue("跟单");
  await again.dialog.locator(".settings-folder-more").getByRole("button", { name: "恢复默认" }).click();
  await expect(again.dialog.locator(".settings-folder-more")).toHaveCount(0);
  await again.dialog.getByRole("button", { name: "关闭设置" }).click();
  tab = await miniFolderTab(page, "客户跟单");
  await expect(tab).toHaveText("客户");
});

test("only one panel at a time: opening 「⋯」 closes the colours, and the other way round", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  const { dialog, group } = await openFolderSettings(page, "话术目录");
  await addFolder(page, group, "客户跟单");
  await addFolder(page, group, "样品寄送");
  await group.getByRole("button", { name: "修改颜色 客户跟单" }).click();
  await expect(dialog.locator(".settings-swatches")).toHaveCount(1);
  await group.getByRole("button", { name: "更多设置 样品寄送" }).click();
  await expect(dialog.locator(".settings-swatches")).toHaveCount(0);
  await expect(dialog.locator(".settings-folder-more")).toHaveCount(1);
  await group.getByRole("button", { name: "更多设置 客户跟单" }).click();
  await expect(dialog.locator(".settings-folder-more")).toHaveCount(1);
  await expect(dialog.locator(".settings-folder-more").getByRole("textbox")).toHaveAttribute("aria-label", "迷你窗口显示为 客户跟单");
  await dialog.locator(".settings-folder-more").getByRole("button", { name: "取消" }).click();
  await expect(dialog.locator(".settings-folder-more")).toHaveCount(0);
});

test("an image folder gets a short name the same way", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  const { dialog, group } = await openFolderSettings(page, "图片目录");
  await addFolder(page, group, "产品图片");
  await group.getByRole("button", { name: "更多设置 产品图片" }).click();
  const panel = dialog.locator(".settings-folder-more");
  await expect(panel.getByRole("textbox")).toHaveAttribute("placeholder", "产品");
  await panel.getByRole("textbox").fill("样品");
  await panel.getByRole("button", { name: "保存" }).click();
  await expect(panel).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭设置" }).click();

  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  await page.locator(".kind-switch.compact").getByRole("button", { name: "图片" }).click();
  const tab = page.locator('.mini-folders .mini-tab[title="产品图片"]');
  await expect(tab).toHaveText("样品");
  await expect(tab).toHaveAttribute("aria-label", "产品图片");

  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.setViewportSize({ width: 680, height: 620 });
  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  await page.locator(".kind-switch.compact").getByRole("button", { name: "图片" }).click();
  await expect(page.locator('.mini-folders .mini-tab[title="产品图片"]')).toHaveText("样品");
});
