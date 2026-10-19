import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

async function open(page, platform) {
  await asDesktop(page, platform);
  await page.addInitScript(() => { if (!sessionStorage.getItem("__kept")) { localStorage.removeItem("clipbox.vault.samples.v2"); sessionStorage.setItem("__kept", "1"); } });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const region = page.getByRole("region", { name: "保险箱" });
  await expect(region.locator(".vault-entry").first()).toBeVisible();
  return region;
}

for (const platform of ["win32", "darwin"]) {
  // Windows seeds only the 范例 kinds it has a category for (登录, 收款信息, 验证码); Mac has 5.
  const SAMPLES = platform === "win32" ? 3 : 5;
  test(`${platform}: 收起 (left of 选择) folds every website card to its title and 展开 brings them back`, async ({ page }) => {
    const region = await open(page, platform);
    const head = page.locator(".section-head");
    await expect(head.getByRole("button")).toHaveText(["收起", "密码体检", "选择"]);
    await head.getByRole("button", { name: "收起账号" }).click();
    await expect(region.locator(".vault-group h3")).toHaveCount(2);
    await expect(region.locator(".vault-entry")).toHaveCount(0);
    await head.getByRole("button", { name: "展开账号" }).click();
    await expect(region.locator(".vault-entry")).toHaveCount(SAMPLES);
  });

  test(`${platform}: 选择 ticks entries and 移到回收站 moves them to the 回收站 without asking, where 恢复 brings them back`, async ({ page }) => {
    const region = await open(page, platform);
    await page.locator(".section-head").getByRole("button", { name: "选择" }).click();
    await expect(page.locator(".section-head").getByRole("button", { name: "收起账号" })).toHaveCount(0);
    const bar = page.getByRole("toolbar", { name: "批量操作" });
    await expect(bar).toContainText("已选 0 条");
    await expect(bar.getByRole("button", { name: "移到回收站" })).toBeDisabled();
    const boxes = region.getByRole("checkbox");
    await expect(boxes).toHaveCount(SAMPLES);
    await boxes.nth(0).click();
    await region.locator(".vault-entry").nth(1).click();
    await expect(bar).toContainText("已选 2 条");
    await bar.getByRole("button", { name: "移到回收站" }).click();
    await expect(region.locator(".vault-entry")).toHaveCount(SAMPLES - 2);
    await expect(page.getByRole("toolbar", { name: "批量操作" })).toHaveCount(0);
    await page.getByRole("button", { name: /^回收站/ }).click();
    await expect(page.getByRole("region", { name: "保险箱" }).locator(".vault-entry")).toHaveCount(2);
    await page.getByRole("region", { name: "保险箱" }).getByRole("button", { name: "恢复" }).first().click();
    await expect(page.getByRole("region", { name: "保险箱" }).locator(".vault-entry")).toHaveCount(1);
  });

  test(`${platform}: each entry has 移到回收站 in its 「…」 menu (to the 回收站), and 全选 selects all`, async ({ page }) => {
    const region = await open(page, platform);
    await region.getByRole("button", { name: /^更多操作/ }).first().click();
    await region.getByRole("menuitem", { name: "移到回收站" }).click();
    await expect(region.locator(".vault-entry")).toHaveCount(SAMPLES - 1);
    await expect(page.getByText("已移到回收站，可以恢复")).toBeVisible();
    await page.locator(".section-head").getByRole("button", { name: "选择" }).click();
    await page.getByRole("toolbar", { name: "批量操作" }).getByRole("button", { name: "全选" }).click();
    await expect(page.getByRole("toolbar", { name: "批量操作" })).toContainText(`已选 ${SAMPLES - 1} 条`);
    await page.getByRole("toolbar", { name: "批量操作" }).getByRole("button", { name: "完成" }).click();
    await expect(region.getByRole("checkbox")).toHaveCount(0);
  });
}

test("a locked 账号 page shows no 收起 or 选择", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "安全" }).click();
  await settings.getByRole("button", { name: "设置…" }).click();
  await settings.getByLabel("新密码", { exact: true }).fill("abcd1234");
  await settings.getByLabel("再输入一次新密码").fill("abcd1234");
  await settings.getByRole("button", { name: "保存" }).click();
  await settings.getByLabel("我已经把恢复码保存好了").check();
  await settings.getByRole("button", { name: "完成" }).click();
  await settings.getByRole("button", { name: "关闭设置" }).click();
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await expect(page.getByRole("form", { name: "账号页已上锁" })).toBeVisible();
  await expect(page.getByRole("button", { name: "选择", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /收起账号|展开账号/ })).toHaveCount(0);
});
