import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

async function openData(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("tab", { name: "数据" }).click();
  return dialog;
}

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: 导入测试内容 adds the test 话术 once, 清除测试内容 sends only those to the trash`, async ({ page }) => {
    await asDesktop(page, platform);
    await page.goto("/");
    await page.waitForSelector(".app-shell");
    // The user's own 话术 first.
    await page.getByRole("button", { name: /新增/ }).first().click();
    const editor = page.locator(".inline-editor");
    await editor.locator("input").first().fill("我自己的话术");
    await editor.locator("textarea").first().fill("This one is mine.");
    await editor.locator(".editor-save").first().click();
    await expect(page.locator(".native-row", { hasText: "我自己的话术" })).toBeVisible();

    let s = await openData(page);
    await s.getByRole("button", { name: "导入", exact: true }).click();
    await expect(page.getByText(/已放入测试内容：话术 \d+ 条/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".native-row", { hasText: "首次问候" }).first()).toBeVisible();
    const withTest = await page.locator(".native-row").count();
    expect(withTest).toBeGreaterThan(10);

    // Importing again changes nothing.
    s = await openData(page);
    await s.getByRole("button", { name: "导入", exact: true }).click();
    await expect(page.getByText(platform === "darwin" ? /已放入测试内容|测试内容都在/ : "测试内容都在，没有缺的")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".native-row")).toHaveCount(withTest);

    // Clear: the box says how many first; cancelling removes nothing.
    s = await openData(page);
    await s.getByRole("button", { name: "清除…" }).click();
    await expect(s.getByRole("status")).toContainText(/将清除：话术 \d+ 条/);
    await s.getByRole("button", { name: "取消" }).click();
    await s.getByRole("button", { name: "清除…" }).click();
    await s.getByRole("button", { name: "确认清除" }).click();
    await expect(page.getByText(/已清除 \d+ 条测试内容/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".native-row", { hasText: "我自己的话术" })).toBeVisible();
    await expect(page.locator(".native-row", { hasText: "首次问候" })).toHaveCount(0);
    // They are in the trash, not gone for good.
    await page.getByRole("button", { name: /^回收站/ }).click();
    await expect(page.locator(".native-row", { hasText: "首次问候" }).first()).toBeVisible();
  });
}

test("a 话术 sheet the user already imported is not duplicated by 导入测试内容", async ({ page }) => {
  await seedSnippets(page);
  const before = await page.locator(".native-row").count();
  const s = await openData(page);
  await s.getByRole("button", { name: "导入", exact: true }).click();
  await expect(page.getByText(/测试内容都在/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".native-row")).toHaveCount(before);
});
