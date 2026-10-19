import { expect, test } from "@playwright/test";
import { accountAddButton, asDesktop, openAccountCategory } from "./helpers.mjs";

for (const platform of ["darwin", "win32"]) {
  test(`地址 (${platform}): add a company address, copy one part and the whole address, find it by search, edit, delete`, async ({ page }) => {
    await asDesktop(page, platform);
    await page.goto("/");
    await page.waitForSelector(".app-shell");
    await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
    const dialog = page.getByRole("region", { name: "保险箱" });
    await openAccountCategory(page, "地址");
    await accountAddButton(page).click();
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(dialog).toContainText("请填写公司名称");
    await expect(dialog).toContainText("请填写地址");
    await dialog.getByLabel("公司名称").fill("广州某某贸易有限公司");
    await dialog.getByLabel("联系人（可不填）").fill("张三");
    await dialog.getByLabel("电话（可不填）").fill("138 0000 0000");
    await dialog.getByRole("textbox", { name: /^地址/ }).fill("广州市天河区\n某某路 1 号");
    await dialog.getByRole("button", { name: "保存" }).click();
    await dialog.getByRole("button", { name: "复制电话" }).click();
    await expect.poll(() => page.evaluate(() => window.__copied)).toBe("138 0000 0000");
    await dialog.getByRole("button", { name: "复制完整地址" }).click();
    await expect.poll(() => page.evaluate(() => window.__copied)).toBe("广州某某贸易有限公司\n张三 138 0000 0000\n广州市天河区\n某某路 1 号");
    // Encrypted with the other 账号 entries.
    expect(await page.evaluate(() => localStorage.getItem("clipbox.vault-items.v1"))).not.toContain("天河");
    // 全部 shows it in its own 地址 card, and search finds it by the address.
    await page.getByRole("navigation", { name: "快捷入口" }).getByRole("button", { name: /^全部/ }).click();
    await expect(dialog.locator(".vault-group[aria-label='地址']")).toContainText("广州某某贸易有限公司");
    await page.getByPlaceholder(/^搜索/).first().fill("天河");
    await expect(dialog).toContainText("广州某某贸易有限公司");
    await page.getByPlaceholder(/^搜索/).first().fill("");
    await openAccountCategory(page, "地址");
    await dialog.getByRole("button", { name: "复制地址 广州某某贸易有限公司" }).click();
    await expect.poll(() => page.evaluate(() => window.__copied)).toContain("天河区");
    await dialog.getByRole("button", { name: /^地址 广州某某贸易/ }).click();
    await dialog.getByRole("button", { name: "修改" }).click();
    await dialog.getByLabel("备注（可不填）").fill("只收工作日");
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(dialog).toContainText("只收工作日");
    await dialog.getByRole("button", { name: "删除" }).click();
    await dialog.getByRole("button", { name: "确认删除" }).click();
    await expect(dialog).toContainText("还没有地址");
  });
}
