import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

// 设置 → AI → 「连接 Codex 等工具」 (D-060): the commands that let Codex and others start `Copyboxx --mcp`.
async function openAiSettings(page) {
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => { window.__copied = text; }, configurable: true }); });
  await page.getByRole("button", { name: /设置/ }).first().click();
  const dialog = page.locator(".settings-dialog");
  await dialog.getByRole("tab", { name: "AI" }).click();
  return dialog.locator("section[aria-labelledby=set-mcp]");
}

test("Windows: the card shows this computer's program in the Codex command, and 复制 copies it", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.addInitScript(() => { window.clipboxDesktop.mcpProgramPath = async () => "C:\\Users\\Krix\\AppData\\Local\\Copyboxx\\Copyboxx.exe"; });
  const card = await openAiSettings(page);
  await expect(card.getByRole("heading", { name: "连接 Codex 等工具" })).toBeVisible();
  const command = "codex mcp add copyboxx -- \"C:\\Users\\Krix\\AppData\\Local\\Copyboxx\\Copyboxx.exe\" --mcp";
  await expect(card.getByLabel("Codex命令")).toHaveText(command);
  await expect(card.getByLabel("Codex 配置文件命令")).toContainText("command = 'C:\\Users\\Krix\\AppData\\Local\\Copyboxx\\Copyboxx.exe'");
  await expect(card).not.toContainText("示例路径");
  const row = card.locator(".mcp-connect-row", { hasText: "在终端里运行一次" }).first();
  await row.getByRole("button", { name: "复制" }).click();
  await expect(row.getByRole("button", { name: "已复制" })).toBeVisible();
  expect(await page.evaluate(() => window.__copied)).toBe(command);
});

test("Mac preview without a program path shows an example path, marked as one", async ({ page }) => {
  await asDesktop(page, "darwin", { testTools: true });
  const card = await openAiSettings(page);
  await expect(card.getByLabel("Claude Code命令")).toHaveText("claude mcp add copyboxx -- '/Applications/Copyboxx.app/Contents/MacOS/Copyboxx' --mcp");
  await expect(card).toContainText("示例路径");
});

test("settings search finds the card by Codex", async ({ page }) => {
  await asDesktop(page, "win32");
  await openAiSettings(page);
  const dialog = page.locator(".settings-dialog");
  await dialog.getByLabel("搜索设置").fill("codex");
  await expect(dialog.locator("section[aria-labelledby=set-mcp]")).toBeVisible();
});
