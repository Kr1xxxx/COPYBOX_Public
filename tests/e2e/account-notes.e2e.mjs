// 账号 · 笔记: free notes in Markdown, and 「转为登录」 with a preview of which line goes where and 还原 back to the note.
import { expect, test } from "@playwright/test";
import { accountAddButton, asDesktop, openAccountCategory, seedSnippets } from "./helpers.mjs";

const vault = (page) => page.getByRole("region", { name: "保险箱" });

async function openNotes(page, platform) {
  await asDesktop(page, platform);
  if (platform === "win32") await seedSnippets(page);
  else { await page.goto("/"); await page.waitForSelector(".app-shell"); }
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await openAccountCategory(page, "笔记");
  return vault(page);
}

async function addNote(page, title, body) {
  const dialog = vault(page);
  await accountAddButton(page).click();
  await dialog.getByPlaceholder("例如：店铺后台备忘").fill(title);
  await dialog.getByLabel("笔记内容").fill(body);
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: new RegExp(title) })).toBeVisible();
}

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: a note is written in Markdown, shown safely, searchable and copied whole`, async ({ page }) => {
    const dialog = await openNotes(page, platform);
    await accountAddButton(page).click();
    await dialog.getByPlaceholder("例如：店铺后台备忘").fill("周会记录");
    const body = "# 要点\n- **发货**改到周三\n- [x] 问过 [物流](https://example.com/ship)\n\n[坏链接](javascript:alert(1)) <img src=x onerror=alert(1)>";
    await dialog.getByLabel("笔记内容").fill(body);
    await dialog.getByRole("button", { name: "预览" }).click();
    await expect(dialog.getByLabel("预览").locator("strong")).toHaveText("发货");
    await dialog.getByRole("button", { name: "编辑" }).click();
    await expect(dialog.getByLabel("笔记内容")).toHaveValue(body);
    await dialog.getByRole("button", { name: "保存" }).click();

    const md = dialog.locator(".note-md");
    await expect(md.locator("h3")).toHaveText("要点");
    await expect(md.getByRole("link", { name: "物流" })).toHaveAttribute("href", "https://example.com/ship");
    // Not a web address: plain text, never a link; HTML is shown as text, never run.
    await expect(md.getByRole("link")).toHaveCount(1);
    await expect(md.locator("img")).toHaveCount(0);
    await expect(md).toContainText("<img src=x onerror=alert(1)>");

    await dialog.getByRole("button", { name: "复制全文" }).click();
    await expect.poll(() => page.evaluate(() => window.__copied)).toBe(body);

    await dialog.getByRole("button", { name: "返回列表" }).click();
    await expect(page.getByRole("navigation", { name: "分类" }).getByRole("button", { name: /^笔记/ })).toContainText("1");
    const card = dialog.locator(".vault-group", { hasText: "笔记" });
    await expect(card.locator(".vault-type-chip")).toHaveText("笔记");
    await expect(card).toContainText("要点 发货改到周三");
    // The search looks inside the note's text.
    await page.getByRole("navigation", { name: "快捷入口" }).getByRole("button", { name: /^全部/ }).click();
    await page.getByPlaceholder("搜索名称、网站、用户名").fill("周三");
    await expect(dialog.locator(".vault-entry")).toHaveCount(1);
    await expect(dialog.locator(".vault-entry")).toContainText("周会记录");
  });
}

test("转为登录: the preview shows which line fills which field, saves a login, and 还原 brings the note back unchanged", async ({ page }) => {
  const dialog = await openNotes(page, "win32");
  const body = "# Shopify 后台\n网址：admin.shopify.com\n账号: boss@example.com\n密码: s3cret!Pass\n客服共用";
  await addNote(page, "店铺备忘", body);
  await dialog.getByRole("button", { name: "转为登录…" }).click();

  const form = dialog.getByRole("form", { name: "转为登录" });
  await expect(form.getByLabel("名称", { exact: true })).toHaveValue("Shopify 后台");
  await expect(form.getByLabel("网址", { exact: true })).toHaveValue("admin.shopify.com");
  await expect(form.getByLabel("用户名 / 邮箱", { exact: true })).toHaveValue("boss@example.com");
  await expect(form.getByLabel("密码", { exact: true })).toHaveValue("s3cret!Pass");
  await expect(form.getByLabel("备注", { exact: true })).toHaveValue("客服共用");
  await expect(form.getByLabel("密码来自哪一行")).toHaveValue("4");
  // Pick another line for the name; the field follows, and can still be typed over.
  await form.getByLabel("名称来自哪一行").selectOption("5");
  await expect(form.getByLabel("名称", { exact: true })).toHaveValue("客服共用");
  await form.getByLabel("名称", { exact: true }).fill("Shopify 主账号");
  // Nothing is saved without a password.
  await form.getByLabel("密码", { exact: true }).fill("");
  await form.getByRole("button", { name: "保存为登录" }).click();
  await expect(form.getByRole("alert")).toHaveText("请填写密码");
  await form.getByLabel("密码来自哪一行").selectOption("4");
  await form.getByRole("button", { name: "保存为登录" }).click();

  // The new login opens; the note left the 笔记 list but its original text is kept.
  await expect(dialog.getByRole("button", { name: /Shopify 主账号/ })).toBeVisible();
  await expect(dialog).toContainText("由笔记「店铺备忘」转来");
  await dialog.getByRole("button", { name: "看原文" }).click();
  await expect(dialog.getByLabel("笔记原文")).toContainText("密码: s3cret!Pass");
  await dialog.getByRole("button", { name: "复制密码" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("s3cret!Pass");
  await expect(page.getByRole("navigation", { name: "分类" }).getByRole("button", { name: /^笔记/ })).toContainText("0");

  await dialog.getByRole("button", { name: "还原为笔记" }).click();
  await expect(dialog.getByRole("alert")).toContainText("这条登录会删除");
  await dialog.getByRole("button", { name: "确认还原" }).click();
  await expect(dialog.locator(".note-md h3")).toHaveText("Shopify 后台");
  await dialog.getByRole("button", { name: "修改" }).click();
  await expect(dialog.getByLabel("笔记内容")).toHaveValue(body);
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("navigation", { name: "分类" }).getByRole("button", { name: /^笔记/ })).toContainText("1");
  await openAccountCategory(page, "登录");
  await expect(dialog).not.toContainText("Shopify 主账号");
});

test("Mac: 转为 API previews named hidden fields, saves an API entry with them hidden, and 还原 brings the note back", async ({ page }) => {
  const dialog = await openNotes(page, "darwin");
  const body = "# 店铺接口\n服务: Shopify\n地址: https://shop.example.com/api\nClient ID: client-AAAA1111\nClient Secret: secret-BBBB2222\n只给售后组用";
  await addNote(page, "接口备忘", body);
  await dialog.getByRole("button", { name: "转为 API…" }).click();

  const form = dialog.getByRole("form", { name: "转为 API" });
  await expect(form.getByLabel("名称", { exact: true })).toHaveValue("店铺接口");
  await expect(form.getByLabel("服务", { exact: true })).toHaveValue("Shopify");
  await expect(form.getByLabel("接口地址", { exact: true })).toHaveValue("https://shop.example.com/api");
  await expect(form.getByLabel("第 1 项的名字")).toHaveValue("Client ID");
  await expect(form.getByLabel("第 2 项的内容")).toHaveValue("secret-BBBB2222");
  await expect(form.getByLabel("第 2 项来自哪一行")).toHaveValue("5");
  await expect(form.getByLabel("备注", { exact: true })).toHaveValue("只给售后组用");
  // Add a third field by hand, then drop it again.
  await form.getByRole("button", { name: "添加一项" }).click();
  await form.getByRole("button", { name: "删掉第 3 项" }).click();
  await form.getByRole("button", { name: "保存为 API" }).click();

  await expect(dialog.getByRole("button", { name: /店铺接口/ })).toContainText("尾号 1111 · 2 项");
  await expect(dialog).not.toContainText("BBBB2222");
  await expect(dialog).toContainText("由笔记「接口备忘」转来");
  await dialog.getByRole("button", { name: "复制Client Secret" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("secret-BBBB2222");

  await dialog.getByRole("button", { name: "还原为笔记" }).click();
  await dialog.getByRole("button", { name: "确认还原" }).click();
  await expect(dialog.locator(".note-md h3")).toHaveText("店铺接口");
  await expect(page.getByRole("navigation", { name: "分类" }).getByRole("button", { name: /^API 密钥/ })).toContainText("0");
});

test("Windows: notes offer 转为登录 only, no 转为 API", async ({ page }) => {
  const dialog = await openNotes(page, "win32");
  await addNote(page, "接口备忘", "Key: abc");
  await expect(dialog.getByRole("button", { name: "转为登录…" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "转为 API…" })).toHaveCount(0);
});
