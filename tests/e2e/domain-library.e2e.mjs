import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { asDesktop, seedSnippets, signInAtGate } from "./helpers.mjs";

// Company 话术 by the signed-in email's domain, against the pretend server (app/cloud-demo.ts): it binds example.com to
// three 话术 (DEMO-DOMAIN-1…3); every other domain gets none. A typed 同步码 always wins.
const V1 = fileURLToPath(new URL("../../docs/samples/shared-library-v1.json", import.meta.url));
const LINE = "公司话术：按邮箱自动获取（example.com）";

async function openHome(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.waitForSelector(".settings-dialog");
  return page.locator(".settings-dialog section[aria-labelledby=set-home-account]");
}

// The app opens only after the sign-in (D-085), so the 话术 are seeded after it: the first sync of an empty computer
// then brings nothing but the company library.
test.beforeEach(async ({ page }) => {
  await asDesktop(page, "win32");
  await page.addInitScript(() => { window.clipboxDesktop.cloudDemo = true; });
});

test("signing in at a bound domain brings in the company's 话术 and Settings says where they come from", async ({ page }) => {
  await signInAtGate(page, "someone@example.com");
  await expect(page.getByText(/公司话术已同步：新增 3 条/)).toBeVisible();
  await seedSnippets(page);
  const before = await page.locator(".native-row").count() - 3;
  const card = await openHome(page);
  await expect(card.locator(".cloud-email")).toHaveText("someone@example.com");
  await expect(card.locator(".cloud-domain-library")).toHaveText(LINE);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.domain-library.v1")).domain)).toBe("example.com");
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expect(page.locator(".native-row")).toHaveCount(before + 3);
  await expect(page.locator(".native-row").filter({ hasText: "公司欢迎语" })).toHaveCount(1);

  // Next start: the same library again, quietly and without duplicates.
  await page.reload();
  await page.waitForSelector(".native-row");
  await page.waitForTimeout(1200);
  await expect(page.locator(".native-row")).toHaveCount(before + 3);
  await expect(page.getByText("公司话术已同步")).toHaveCount(0);

  // Signing out forgets that this computer gets a domain library and shows the login page; the 话术 already here stay.
  const again = await openHome(page);
  await expect(again.locator(".cloud-domain-library")).toHaveText(LINE);
  await again.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByRole("heading", { name: "登录后开始使用" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("clipbox.domain-library.v1"))).toBeNull();
  await signInAtGate(page, "someone@example.com");
  await expect(page.locator(".native-row")).toHaveCount(before + 3);
});

test("a free-mail address gets no company 话术 and no line in Settings", async ({ page }) => {
  await signInAtGate(page, "someone@gmail.com");
  await seedSnippets(page);
  const before = await page.locator(".native-row").count();
  const card = await openHome(page);
  await expect(card.locator(".cloud-last-sync")).toContainText("最后同步");
  await page.waitForTimeout(800);
  await expect(card.locator(".cloud-domain-library")).toHaveCount(0);
  await expect(page.getByText("公司话术已同步")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("clipbox.domain-library.v1"))).toBeNull();
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expect(page.locator(".native-row")).toHaveCount(before);
});

test("with a 同步码 typed, the domain library is not asked for or applied", async ({ page }) => {
  const fs = await import("node:fs");
  const body = fs.readFileSync(V1, "utf8");
  await page.route("https://copyboxx.com/sync/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body }));
  // The 同步码 was typed before this sign-in (it lives in the page's storage).
  await page.addInitScript(() => { localStorage.setItem("clipbox.shared-library-url", "https://copyboxx.com/sync/XS-7KQ2M9AB/snippets.json"); });
  await signInAtGate(page, "someone@example.com");
  await seedSnippets(page);
  const before = await page.locator(".native-row").count() - 3;
  const card = await openHome(page);
  await expect(card.getByLabel("企业同步码")).toHaveValue("https://copyboxx.com/sync/XS-7KQ2M9AB/snippets.json");
  await expect(card.locator(".cloud-last-sync")).toContainText("最后同步");
  await page.waitForTimeout(800);
  await expect(card.locator(".cloud-domain-library")).toHaveCount(0);
  await expect(page.getByText("公司话术已同步")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("clipbox.domain-library.v1"))).toBeNull();
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expect(page.locator(".native-row")).toHaveCount(before + 3);
  await expect(page.locator(".native-row").filter({ hasText: "公司欢迎语" })).toHaveCount(0);
});
