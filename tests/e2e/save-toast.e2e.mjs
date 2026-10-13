// After a save in the editor the toast offers 编辑 (more prominent) and 撤销. Every toast fades out at the end of its time,
// and while the pointer is on it the time stops and it is fully visible again.
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

const toast = (page) => page.locator(".toast");

async function firstTitle(page) {
  return (await page.locator(".native-row .snippet-label").first().textContent()).trim();
}

async function editFirst(page, title) {
  await page.locator(".native-row .row-main").first().click();
  await page.locator(".native-row.selected").getByRole("button", { name: "编辑", exact: true }).click();
  const editor = page.locator(".inline-editor");
  await editor.locator("input").first().fill(title);
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toHaveCount(0);
}

async function addNew(page, title) {
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await editor.locator("input").first().fill(title);
  await editor.getByRole("textbox", { name: "话术内容" }).fill("Thanks for waiting, your parcel is on the way.");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toHaveCount(0);
}

async function search(page, text) {
  await page.getByPlaceholder(/搜索/).first().fill(text);
}

for (const platform of ["win32", "darwin"]) {
  test.describe(platform, () => {
    test.beforeEach(async ({ page }) => {
      await asDesktop(page, platform);
      await seedSnippets(page);
    });

    test("the save toast has 编辑 and 撤销, 编辑 filled with the accent and 撤销 quiet", async ({ page }) => {
      await editFirst(page, "售后夸赞（新）");
      await expect(toast(page)).toContainText("条目已更新");
      const edit = toast(page).getByRole("button", { name: "编辑" });
      const undo = toast(page).getByRole("button", { name: "撤销" });
      await expect(edit).toBeVisible();
      await expect(undo).toBeVisible();
      await expect(edit).toHaveClass(/\bprimary\b/);
      const accent = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--accent)";
        document.body.append(probe);
        const colour = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return colour;
      });
      const look = (locator) => locator.evaluate((element) => { const style = getComputedStyle(element); return { background: style.backgroundColor, weight: Number(style.fontWeight), color: style.color }; });
      const editLook = await look(edit);
      const undoLook = await look(undo);
      expect(editLook.background).toBe(accent);
      expect(undoLook.background).not.toBe(accent);
      expect(editLook.weight).toBeGreaterThan(undoLook.weight);
      // 编辑 comes first, right after the text.
      const editBox = await edit.boundingBox();
      const undoBox = await undo.boundingBox();
      expect(editBox.x).toBeLessThan(undoBox.x);
    });

    test("撤销 after an edit brings the old title back, and it stays after a reload", async ({ page }) => {
      const old = await firstTitle(page);
      await editFirst(page, "改过的标题");
      await expect(page.locator(".native-row", { hasText: "改过的标题" })).toHaveCount(1);
      await toast(page).getByRole("button", { name: "撤销" }).click();
      await expect(toast(page)).toContainText("已撤销");
      await expect(page.locator(".native-row", { hasText: "改过的标题" })).toHaveCount(0);
      await expect(page.locator(".native-row .snippet-label").first()).toHaveText(old);
      await page.waitForTimeout(300);
      await page.reload();
      await page.waitForSelector(".native-row");
      await expect(page.locator(".native-row", { hasText: "改过的标题" })).toHaveCount(0);
      await expect(page.locator(".native-row .snippet-label").first()).toHaveText(old);
    });
  });
}

test.describe("win32", () => {
  test.beforeEach(async ({ page }) => {
    await asDesktop(page, "win32");
    await seedSnippets(page);
  });

  test("on hover the toast stays fully visible past its time; after the pointer leaves it fades and goes", async ({ page }) => {
    await editFirst(page, "悬停测试");
    const box = await toast(page).boundingBox();
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.waitForTimeout(6500); // the save toast's own time is 5 s
    await expect(toast(page)).toHaveCount(1);
    await expect(toast(page)).not.toHaveAttribute("data-fading", /.*/);
    expect(Number(await toast(page).evaluate((element) => getComputedStyle(element).opacity))).toBe(1);

    await page.mouse.move(5, 5);
    await expect(toast(page)).toHaveAttribute("data-fading", "", { timeout: 6000 });
    // Mid-fade it is see-through but still there.
    await page.waitForTimeout(500);
    const mid = Number(await toast(page).evaluate((element) => getComputedStyle(element).opacity));
    expect(mid).toBeLessThan(1);
    // Back on it: full strength again within a short moment.
    const again = await toast(page).boundingBox();
    await page.mouse.move(again.x + 20, again.y + again.height / 2);
    await expect(toast(page)).not.toHaveAttribute("data-fading", /.*/);
    await page.waitForTimeout(250);
    expect(Number(await toast(page).evaluate((element) => getComputedStyle(element).opacity))).toBe(1);
    await page.mouse.move(5, 5);
    await expect(toast(page)).toHaveCount(0, { timeout: 8000 });
  });

  test("an ordinary toast fades before it leaves", async ({ page }) => {
    await page.getByRole("button", { name: "新建目录" }).click();
    const input = page.getByRole("textbox", { name: "新目录名称" });
    await input.fill("淡出测试");
    await input.press("Enter");
    await expect(toast(page)).toContainText("目录已创建");
    await expect(toast(page)).not.toHaveAttribute("data-fading", /.*/);
    await expect(toast(page)).toHaveAttribute("data-fading", "", { timeout: 3000 });
    await expect(toast(page)).toHaveCount(0, { timeout: 3000 });
  });

  test("撤销 after adding a new entry removes it: not in the list, not after a reload, not in the 回收站", async ({ page }) => {
    await addNew(page, "刚加的话术");
    await expect(toast(page)).toContainText("条目已加密保存");
    await expect(page.locator(".native-row", { hasText: "刚加的话术" })).toHaveCount(1);
    await toast(page).getByRole("button", { name: "撤销" }).click();
    await expect(toast(page)).toContainText("已撤销");
    await expect(page.locator(".native-row", { hasText: "刚加的话术" })).toHaveCount(0);
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector(".native-row");
    await expect(page.locator(".native-row", { hasText: "刚加的话术" })).toHaveCount(0);
    await page.getByRole("button", { name: /回收站/ }).first().click();
    await expect(page.locator(".native-row", { hasText: "刚加的话术" })).toHaveCount(0);
  });

  test("编辑 opens the editor on the entry that was just saved", async ({ page }) => {
    await editFirst(page, "再改一次");
    await toast(page).getByRole("button", { name: "编辑" }).click();
    await expect(toast(page)).toHaveCount(0);
    const editor = page.locator(".inline-editor");
    await expect(editor).toHaveCount(1);
    await expect(editor).toHaveAttribute("aria-label", "编辑 再改一次");
    await expect(editor.locator("input").first()).toHaveValue("再改一次");
    await expect(editor).toBeInViewport();
  });

  test("编辑 opens the entry even when a search now hides it", async ({ page }) => {
    await addNew(page, "新的一条");
    await search(page, "完全不相干的词");
    await toast(page).getByRole("button", { name: "编辑" }).click();
    const editor = page.locator(".inline-editor");
    await expect(editor).toHaveAttribute("aria-label", "编辑 新的一条");
  });

  test("撤销 refuses when the entry changed again after the save, and keeps the newer change", async ({ page }) => {
    await editFirst(page, "保存后又收藏");
    const row = page.locator(".native-row", { hasText: "保存后又收藏" });
    await row.getByRole("button", { name: /^收藏 / }).click();
    await expect(row.getByRole("button", { name: /^取消收藏 / })).toHaveCount(1);
    // The 收藏 change does not replace the save toast, so 撤销 is still there.
    await toast(page).getByRole("button", { name: "撤销" }).click();
    await expect(toast(page)).toContainText("这条保存后又改过，没有撤销");
    await expect(toast(page)).toHaveAttribute("data-tone", "error");
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("button", { name: /^取消收藏 / })).toHaveCount(1);
  });

  test("the 回收站 撤销 still works through the same toast", async ({ page }) => {
    const title = await firstTitle(page);
    await page.locator(".row-main").first().click();
    await page.getByRole("button", { name: /^更多操作/ }).first().click();
    await page.locator(".row-menu").getByRole("menuitem", { name: "移到回收站" }).click();
    await expect(toast(page)).toContainText("已移入回收站");
    await expect(toast(page)).toHaveClass(/\bundo-toast\b/);
    await toast(page).getByRole("button", { name: "撤销" }).click();
    await expect(toast(page)).toContainText("已恢复到原目录");
    await expect(page.locator(".native-row .snippet-label").first()).toHaveText(title);
  });
});
