import { expect, test } from "@playwright/test";
import { accountAddButton, asDesktop, openAccountCategory } from "./helpers.mjs";

async function openApiKeys(page, platform, { samples = false } = {}) {
  await asDesktop(page, platform);
  // The helpers skip the 范例 entries; one test wants them, because they are written the old way (key only).
  if (samples) await page.addInitScript(() => localStorage.removeItem("clipbox.vault.samples.v2"));
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const dialog = page.getByRole("region", { name: "保险箱" });
  await expect(dialog).toBeVisible();
  await openAccountCategory(page, "API 密钥");
  return dialog;
}

for (const platform of ["darwin"]) {
  test(`${platform}: an API entry keeps Key, Secret and Client ID together with a 备注; each field is hidden on its own`, async ({ page }) => {
    const dialog = await openApiKeys(page, platform);
    await accountAddButton(page).click();
    await dialog.getByPlaceholder("例如：客服 AI 接口").fill("店铺后台接口");
    await dialog.getByLabel("密钥", { exact: true }).fill("shop-key-AAAA1111");
    await dialog.getByRole("button", { name: "再加一项" }).click();
    await dialog.getByLabel("Secret", { exact: true }).fill("shop-secret-BBBB2222");
    await dialog.getByRole("button", { name: "再加一项" }).click();
    await expect(dialog.getByLabel("第 3 项的名字")).toHaveValue("Client ID");
    await dialog.getByLabel("Client ID", { exact: true }).fill("client-CCCC3333");
    await dialog.getByLabel("备注（可不填，不会隐藏）").fill("只给售后组用\n额度每月 1000 次");
    await dialog.getByRole("button", { name: "保存" }).click();

    const head = dialog.getByRole("button", { name: /店铺后台接口/ });
    await expect(head).toContainText("尾号 1111 · 3 项");
    for (const tail of ["1111", "2222", "3333"]) await expect(dialog).toContainText(`••••••••${tail}`);
    await expect(dialog).not.toContainText("BBBB");
    await expect(dialog).toContainText("额度每月 1000 次");
    await dialog.getByRole("button", { name: "显示Client ID", exact: true }).click();
    await expect(dialog).toContainText("client-CCCC3333");
    await expect(dialog).not.toContainText("shop-secret-BBBB2222");
    await dialog.getByRole("button", { name: "复制Secret" }).click();
    await expect.poll(() => page.evaluate(() => window.__copied)).toBe("shop-secret-BBBB2222");
    expect(await page.evaluate(() => localStorage.getItem("clipbox.vault-items.v1"))).not.toContain("CCCC");
    await expect(dialog.getByRole("button", { name: "复制引用" })).toHaveCount(platform === "darwin" ? 1 : 0);

    // Edit: rename a field, remove one; names must be unique.
    await dialog.getByRole("button", { name: "修改", exact: true }).click();
    await dialog.getByLabel("第 3 项的名字").fill("secret");
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(dialog).toContainText("名字重复了");
    await dialog.getByLabel("第 3 项的名字").fill("App ID");
    await dialog.getByRole("button", { name: "删掉Secret" }).click();
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(head).toContainText("尾号 1111 · 2 项");
    await expect(dialog.getByRole("button", { name: "复制App ID" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "复制Secret" })).toHaveCount(0);
  });
}

test("an API entry saved before keeps its key as the first field and can get more", async ({ page }) => {
  const dialog = await openApiKeys(page, "darwin", { samples: true });
  // The 范例 entry was written the old way (key only, no fields).
  await dialog.getByRole("button", { name: /^API 【范例】接口密钥/ }).click();
  await expect(dialog).toContainText("••••••••MPLE");
  await dialog.getByRole("button", { name: "修改", exact: true }).click();
  await expect(dialog.getByLabel("密钥", { exact: true })).toHaveValue("demo_key_0000000000EXAMPLE");
  await dialog.getByRole("button", { name: "再加一项" }).click();
  await dialog.getByLabel("Secret", { exact: true }).fill("demo-secret-0001");
  await dialog.getByRole("button", { name: "保存" }).click();
  await dialog.getByRole("button", { name: "复制密钥", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("demo_key_0000000000EXAMPLE");
  await expect(dialog.getByRole("button", { name: /【范例】接口密钥/ }).first()).toContainText("· 2 项");
});
