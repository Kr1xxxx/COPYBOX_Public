import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

async function openVault(page) {
  await asDesktop(page, "darwin");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const dialog = page.getByRole("region", { name: "保险箱" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "API 密钥", exact: true }).click();
  return dialog;
}

const day = (offset) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test("API 密钥: service is guessed from the prefix, key is hidden until held, copy works, expiry is flagged, 全部 groups it under the service", async ({ page }) => {
  const dialog = await openVault(page);
  await dialog.getByRole("button", { name: "添加 API 密钥" }).click();
  await dialog.getByPlaceholder("例如：客服 AI 接口").fill("客服 AI 接口");
  await dialog.getByLabel("密钥", { exact: true }).fill("sk-ant-api03-ABCDEFGH1234");
  await expect(dialog).toContainText("看起来是 Anthropic 的密钥");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: /客服 AI 接口/ })).toContainText("Anthropic · 尾号 1234");
  await expect(dialog).toContainText("••••••••1234");
  await expect(dialog).not.toContainText("ABCDEFGH");
  const eye = dialog.getByRole("button", { name: "显示密钥" });
  const box = await eye.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(dialog).toContainText("sk-ant-api03-ABCDEFGH1234");
  await page.mouse.up();
  await expect(dialog).not.toContainText("ABCDEFGH");
  await dialog.getByRole("button", { name: "复制密钥" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("sk-ant-api03-ABCDEFGH1234");
  expect(await page.evaluate(() => localStorage.getItem("clipbox.vault-items.v1"))).not.toContain("ABCDEFGH");
  // Spaces inside a key are refused; a Key + Secret pair with an expiry in 3 days is flagged.
  await dialog.getByRole("button", { name: "添加 API 密钥" }).click();
  await dialog.getByPlaceholder("例如：客服 AI 接口").fill("物流接口");
  await dialog.getByLabel("密钥", { exact: true }).fill("abc def");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toContainText("中间不能有空格");
  await dialog.getByLabel("密钥", { exact: true }).fill("  AIzaSyKEY0000  \n");
  await dialog.getByLabel("Secret", { exact: true }).fill("shh-secret-9999");
  await dialog.getByLabel("到期日（可不填）").fill(day(3));
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: /物流接口/ })).toContainText("3 天后到期");
  await expect(dialog.getByRole("button", { name: /物流接口/ })).toContainText("Google · 尾号 0000");
  await dialog.getByRole("button", { name: "复制Secret" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("shh-secret-9999");
  // 全部: the AIza… key sits under Google with the API chip.
  await dialog.getByRole("button", { name: "全部", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Google" }).locator(".vault-type-chip")).toHaveText(["API"]);
  await expect(dialog.getByRole("region", { name: "Anthropic" })).toContainText("客服 AI 接口");
});

test("API 密钥: an expired key says so; delete asks to confirm", async ({ page }) => {
  const dialog = await openVault(page);
  await dialog.getByRole("button", { name: "添加 API 密钥" }).click();
  await dialog.getByPlaceholder("例如：客服 AI 接口").fill("旧密钥");
  await dialog.getByLabel("密钥", { exact: true }).fill("old-key-0001");
  await dialog.getByLabel("到期日（可不填）").fill(day(-2));
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: /旧密钥/ })).toContainText("已过期 2 天");
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await dialog.getByRole("button", { name: "确认删除" }).click();
  await expect(dialog).toContainText("还没有 API 密钥");
});
