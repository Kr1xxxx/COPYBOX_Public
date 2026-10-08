import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

const DEVICE_KEY = "clipbox.device-key.v1";
const VAULT = "clipbox.vault.v1";

test("Windows: a new vault keeps its key out of the page storage and opens again after a restart", async ({ page }) => {
  await asDesktop(page, "win32", { osKey: true });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  expect(await page.evaluate((k) => localStorage.getItem(k), DEVICE_KEY)).toBeNull();
  expect(await page.evaluate((k) => Boolean(localStorage.getItem(k)), VAULT)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("fake-os-key")).key.length)).toBeGreaterThan(20);
  await page.reload();
  await page.waitForSelector(".app-shell");
  await expect(page.locator(".startup-error, [role=alert]")).toHaveCount(0);
});

test("Windows: an older vault with its key in the page is moved to the protected store and re-encrypted", async ({ page }) => {
  // 1) The old way: no protected store, key saved next to the vault.
  await asDesktop(page, "win32");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const before = await page.evaluate(([v, d]) => ({ vault: localStorage.getItem(v), key: localStorage.getItem(d) }), [VAULT, DEVICE_KEY]);
  expect(before.key).toBeTruthy();

  // 2) Next start has the protected store (a second init script adds the bridge).
  await page.addInitScript(() => {
    Object.assign(window.clipboxDesktop, {
      deviceKeyAvailable: async () => true,
      deviceKeyGet: async () => JSON.parse(sessionStorage.getItem("fake-os-key") || "null"),
      deviceKeySet: async (record) => { sessionStorage.setItem("fake-os-key", JSON.stringify(record)); return true; },
    });
  });
  await page.reload();
  await page.waitForSelector(".app-shell");
  const after = await page.evaluate(([v, d]) => ({ vault: localStorage.getItem(v), key: localStorage.getItem(d), os: JSON.parse(sessionStorage.getItem("fake-os-key")) }), [VAULT, DEVICE_KEY]);
  expect(after.key).toBeNull();
  expect(after.os.previous).toBeUndefined();
  expect(after.os.key).not.toBe(before.key);
  expect(after.vault).not.toBe(before.vault);

  // 3) It keeps opening afterwards.
  await page.reload();
  await page.waitForSelector(".app-shell");
  expect(await page.evaluate((k) => localStorage.getItem(k), DEVICE_KEY)).toBeNull();
});
