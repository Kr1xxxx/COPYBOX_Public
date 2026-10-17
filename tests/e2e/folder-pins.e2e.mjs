import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets, settle } from "./helpers.mjs";

// 目录置顶: the folder ⋯ menu has 置顶 / 取消置顶; pinned folders sit on top in pin order, on this device only.

const folderNames = (page) => page.locator(".sidebar .directory-row[data-sort-id]").evaluateAll((rows) => rows.map((row) => row.dataset.sortId));

async function menuAction(page, folder, action) {
  await page.locator(`.sidebar .directory-row[data-sort-id="${folder}"]`).hover();
  await page.getByRole("button", { name: `管理目录 ${folder}` }).click();
  await page.getByRole("menu", { name: `管理目录 ${folder}` }).getByRole("menuitem", { name: action, exact: true }).click();
  await settle(page);
}

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: pinning a 话术 folder moves it to the top, in pin order, and survives a reload`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    const original = await folderNames(page);
    expect(original.length).toBeGreaterThanOrEqual(3);
    const [first, second, third] = original;
    const last = original[original.length - 1];

    await menuAction(page, third, "置顶");
    await menuAction(page, last, "置顶");
    await expect.poll(() => folderNames(page)).toEqual([third, last, ...original.filter((name) => name !== third && name !== last)]);
    await expect(page.locator(`.directory-row[data-sort-id="${third}"] .directory-pin`)).toBeVisible();
    await expect(page.locator(`.directory-row[data-sort-id="${first}"] .directory-pin`)).toHaveCount(0);

    // The menu of a pinned folder offers 取消置顶 instead.
    await page.locator(`.sidebar .directory-row[data-sort-id="${third}"]`).hover();
    await page.getByRole("button", { name: `管理目录 ${third}` }).click();
    const menu = page.getByRole("menu", { name: `管理目录 ${third}` });
    await expect(menu.getByRole("menuitem", { name: "取消置顶" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "置顶", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    // Folders move only inside their group: the last pinned one cannot go below the others, and 上移 swaps the two pins.
    await page.locator(`.sidebar .directory-row[data-sort-id="${last}"]`).hover();
    await page.getByRole("button", { name: `拖动目录 ${last}` }).click();
    await expect(page.getByRole("menuitem", { name: "下移" })).toBeDisabled();
    await page.getByRole("menuitem", { name: "上移" }).click();
    await settle(page);
    await expect.poll(() => folderNames(page)).toEqual([last, third, ...original.filter((name) => name !== third && name !== last)]);
    await page.locator(`.sidebar .directory-row[data-sort-id="${first}"]`).hover();
    await page.getByRole("button", { name: `拖动目录 ${first}` }).click();
    await expect(page.getByRole("menuitem", { name: "上移" })).toBeDisabled();
    await page.keyboard.press("Escape");

    await page.reload();
    await page.waitForSelector(".app-shell");
    await expect.poll(() => folderNames(page)).toEqual([last, third, ...original.filter((name) => name !== third && name !== last)]);

    await menuAction(page, third, "取消置顶");
    await expect.poll(() => folderNames(page)).toEqual([last, first, second, ...original.slice(2).filter((name) => name !== last)]);
  });
}

test("图片 folders can be pinned too, and a renamed pinned folder stays on top", async ({ page }) => {
  await asDesktop(page, "win32", { imageView: "list" });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(page.locator(".image-section")).toBeVisible();
  for (const name of ["产品图", "证书", "物流"]) {
    await page.getByRole("button", { name: "新建目录" }).click();
    const input = page.getByRole("textbox", { name: "新目录名称" });
    await input.fill(name);
    await input.press("Enter");
    await expect(page.locator(`.sidebar .directory-row[data-sort-id="${name}"]`)).toBeVisible();
  }
  await expect.poll(() => folderNames(page)).toEqual(["产品图", "证书", "物流"]);

  await menuAction(page, "物流", "置顶");
  await expect.poll(() => folderNames(page)).toEqual(["物流", "产品图", "证书"]);
  await expect(page.locator('.directory-row[data-sort-id="物流"] .directory-pin')).toBeVisible();

  await menuAction(page, "物流", "重命名");
  const rename = page.getByRole("textbox", { name: "重命名 物流" });
  await rename.fill("快递");
  await rename.press("Enter");
  await expect.poll(() => folderNames(page)).toEqual(["快递", "产品图", "证书"]);

  await menuAction(page, "快递", "取消置顶");
  await expect.poll(() => folderNames(page)).toEqual(["产品图", "证书", "快递"]);
});
