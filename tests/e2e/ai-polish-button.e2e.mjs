// AI 润色 needs a model: with nothing set up in 设置 → AI the editor shows only AI 整理 (owner, 2026-10-14).
import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

async function openEditor(page) {
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: /新增/ }).first().click();
  return page.locator(".inline-editor");
}

test("without an AI set up the 话术 editor has AI 整理 but no AI 润色", async ({ page }) => {
  await asDesktop(page, "win32");
  const editor = await openEditor(page);
  await expect(editor.getByRole("button", { name: "AI 整理" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "AI 润色" })).toHaveCount(0);
});

test("with an AI set up in 设置 → AI the editor shows AI 润色 again", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.addInitScript(() => localStorage.setItem("clipbox.ai-settings.v1", JSON.stringify({ baseUrl: "https://api.example.com/v1", model: "test-model", polishPrompt: "润色", organizePrompt: "整理" })));
  const editor = await openEditor(page);
  await expect(editor.getByRole("button", { name: "AI 润色" })).toBeVisible();
});
