import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

async function openVault(page) {
  await asDesktop(page, "darwin");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.getByRole("dialog", { name: "设置" }).getByRole("tab", { name: "关于" }).click();
  for (let i = 0; i < 5; i += 1) await page.getByRole("dialog", { name: "设置" }).getByText(/^Clipbox v/).click();
  const dialog = page.getByRole("dialog", { name: "保险箱" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "收款信息" }).click();
  return dialog;
}

test("收款信息: add a bank transfer with checks, copy a field and the English block, edit needs a second confirm, delete", async ({ page }) => {
  const dialog = await openVault(page);
  await dialog.getByRole("button", { name: "添加收款信息" }).click();
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("alert").first()).toBeVisible();
  await dialog.getByPlaceholder("例如：美元电汇 - 招行").fill("美元电汇 - 汇丰");
  await dialog.getByLabel("收款人户名").fill("Comely Beauty Ltd");
  await dialog.getByLabel("银行名称").fill("HSBC");
  await dialog.getByLabel("账号 / IBAN").fill("GB82 WEST 1234 5698 7654 33");
  await dialog.getByLabel("SWIFT / BIC").fill("xx");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toContainText("IBAN 校验没通过");
  await expect(dialog).toContainText("SWIFT / BIC 应是 8 或 11 位");
  await dialog.getByLabel("账号 / IBAN").fill("GB82 WEST 1234 5698 7654 32");
  await dialog.getByLabel("SWIFT / BIC").fill("deut deff");
  await dialog.getByLabel("币种（可不填）").fill("usd");
  await dialog.getByRole("button", { name: "保存" }).click();
  // The saved entry opens with its details; the account is shown in groups of four.
  await expect(dialog).toContainText("GB82 WEST 1234 5698 7654 32");
  await expect(dialog).toContainText("上次修改");
  await dialog.getByRole("button", { name: "复制账号 / IBAN" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("GB82WEST12345698765432");
  await dialog.getByRole("button", { name: /复制整段/ }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("Beneficiary Name: Comely Beauty Ltd\nBank Name: HSBC\nAccount No. / IBAN: GB82WEST12345698765432\nSWIFT / BIC: DEUTDEFF\nCurrency: USD");
  // Stored encrypted, apart from the old 验证码 key.
  const stored = await page.evaluate(() => localStorage.getItem("clipbox.vault-items.v1"));
  expect(stored).toBeTruthy();
  expect(stored).not.toContain("GB82");
  // Editing asks twice.
  await dialog.getByRole("button", { name: "修改" }).click();
  await dialog.getByLabel("银行名称").fill("HSBC Hong Kong");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toContainText("确认要修改吗");
  await dialog.getByRole("button", { name: "确认修改" }).click();
  await dialog.getByRole("button", { name: /美元电汇/ }).click();
  await expect(dialog).not.toContainText("确认要修改吗");
  await dialog.getByRole("button", { name: /美元电汇/ }).click();
  await expect(dialog).toContainText("HSBC Hong Kong");
  // Survives a reload.
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "保险箱" }).click();
  await page.getByRole("dialog", { name: "保险箱" }).getByRole("button", { name: "收款信息" }).click();
  await expect(page.getByRole("dialog", { name: "保险箱" })).toContainText("美元电汇 - 汇丰");
});

test("收款信息: PayPal needs a valid e-mail; delete asks to confirm", async ({ page }) => {
  const dialog = await openVault(page);
  await dialog.getByRole("button", { name: "添加收款信息" }).click();
  await dialog.getByRole("button", { name: "PayPal" }).click();
  await dialog.getByPlaceholder("例如：美元电汇 - 招行").fill("PayPal 主号");
  await dialog.getByLabel("PayPal 邮箱").fill("nope");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toContainText("邮箱格式不对");
  await dialog.getByLabel("PayPal 邮箱").fill("pay@example.com");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toContainText("PayPal · pay@example.com");
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await dialog.getByRole("button", { name: "确认删除" }).click();
  await expect(dialog).toContainText("还没有收款信息");
});
