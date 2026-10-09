import { fileURLToPath } from "node:url";

export const SAMPLE_CSV = fileURLToPath(new URL("../../docs/samples/clipbox-test-snippets.csv", import.meta.url));

// Imports the 37-row sample sheet (2 invalid rows, 1 duplicate) → 34 snippets.
export async function seedSnippets(page) {
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /导入话术表格/ }).first().click(),
  ]);
  await chooser.setFiles(SAMPLE_CSV);
  await page.locator("[role=dialog]").getByRole("button", { name: /导入 \d+ 条/ }).click();
  await page.waitForSelector(".native-row");
  await page.waitForTimeout(2500); // list entrance animation
}

// Pretends to be the desktop app on a given platform ("win32" | "darwin").
export async function asDesktop(page, platform, { osKey = false } = {}) {
  await page.addInitScript(([pl, withOsKey]) => {
    window.clipboxDesktop = {
      platform: pl,
      copyText: async (text) => { window.__copied = text; },
      didCopy() {},
      getVersion: async () => "0.0.0-test",
      onFocusSearch: () => () => {},
      onAutomationCommand: () => () => {},
      respondAutomationCommand() {},
      automationReady() {},
      aiStatus: async () => ({ hasKey: false, origin: "" }),
      // Stands in for the OS-encrypted key store of the Windows desktop app (kept per browser tab).
      ...(withOsKey ? {
        deviceKeyAvailable: async () => true,
        deviceKeyGet: async () => JSON.parse(sessionStorage.getItem("fake-os-key") || "null"),
        deviceKeySet: async (record) => { sessionStorage.setItem("fake-os-key", JSON.stringify(record)); return true; },
      } : {}),
    };
    document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("desktop-app", `platform-${pl}`));
  }, [platform, osKey]);
}
