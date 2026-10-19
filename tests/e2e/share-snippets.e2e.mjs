import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { asDesktop, guideSeenState, seedSnippets } from "./helpers.mjs";

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: 选择 → 导出 saves the picked 话术 as an importable document or as plain text`, async ({ page, browser, baseURL }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    await page.locator(".section-head").getByRole("button", { name: "选择" }).click();
    const rows = page.locator(".native-row .row-main");
    await rows.nth(0).click();
    await rows.nth(1).click();
    const bar = page.getByRole("toolbar", { name: "批量操作" });
    await bar.getByRole("button", { name: "导出" }).click();
    const [doc] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "话术文档（可导入）" }).click()]);
    expect(doc.suggestedFilename()).toMatch(/^copyboxx-share-\d{4}-\d{2}-\d{2}\.md$/);
    const text = readFileSync(await doc.path(), "utf8");
    expect(text).toMatch(/^## 01 /m);
    expect(text.match(/^\*\*.+\*\*$/gm)).toHaveLength(2);
    await expect(bar).toHaveCount(0);

    // A colleague with an empty Copyboxx imports the file with 导入话术表格 and gets both 话术.
    const colleague = await browser.newContext({ baseURL, storageState: guideSeenState(baseURL), viewport: { width: 680, height: 620 } });
    const other = await colleague.newPage();
    await asDesktop(other, platform);
    await other.goto("/");
    await other.waitForSelector(".app-shell");
    const [chooser] = await Promise.all([other.waitForEvent("filechooser"), other.getByRole("button", { name: /导入话术表格/ }).first().click()]);
    await chooser.setFiles({ name: doc.suggestedFilename(), mimeType: "text/markdown", buffer: Buffer.from(text) });
    await expect(other.getByRole("dialog").locator(".import-metrics .positive strong")).toHaveText("2");
    await colleague.close();

    await page.locator(".section-head").getByRole("button", { name: "选择" }).click();
    await rows.nth(0).click();
    await page.getByRole("toolbar", { name: "批量操作" }).getByRole("button", { name: "导出" }).click();
    const [plain] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "纯文本" }).click()]);
    expect(plain.suggestedFilename()).toMatch(/\.txt$/);
    expect(readFileSync(await plain.path(), "utf8")).not.toMatch(/\[[^\]]+\]/);
  });
}
