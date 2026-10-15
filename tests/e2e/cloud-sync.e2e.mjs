import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

// 登录同步 (D-064) against the pretend server the web preview uses (app/cloud-demo.ts): code 123456.
const EMAIL = "staff@example.com";

async function openHome(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.waitForSelector(".settings-dialog");
  return page.locator(".settings-dialog section[aria-labelledby=set-home-account]");
}

function withDemoServer(page, vault) {
  return page.addInitScript(([email, data]) => {
    window.clipboxDesktop.cloudDemo = true;
    if (data && !localStorage.getItem("clipbox.cloud-demo.v1")) {
      localStorage.setItem("clipbox.cloud-demo.v1", JSON.stringify({ vaults: { [email]: { version: 1, data } }, sessions: {}, sent: {} }));
    }
  }, [EMAIL, vault]);
}

const fromOtherComputer = {
  format: 1,
  snippets: [{ id: "other-pc-1", label: "来自另一台电脑的话术", secret: "Hello from the other PC", note: "", color: "", kind: "snippet", folder: "", createdAt: 1, updatedAt: 1 }],
  snippetFolders: [],
  sharedSeen: [],
  accounts: [],
};

test("sign in with an email code: the other computer's 话术 arrive and this computer's go up", async ({ page }) => {
  await asDesktop(page, "win32");
  await withDemoServer(page, fromOtherComputer);
  await seedSnippets(page);
  const card = await openHome(page);

  await card.getByRole("button", { name: "登录…" }).click();
  await card.getByLabel("邮箱").fill("not-an-email");
  await card.getByRole("button", { name: "发送验证码" }).click();
  await expect(card.getByRole("alert")).toHaveText("邮箱格式不对，请检查一下");
  await card.getByLabel("邮箱").fill(EMAIL);
  await card.getByRole("button", { name: "发送验证码" }).click();
  await expect(card.getByText("验证码已发到")).toBeVisible();
  await expect(card.getByText("测试版不会真的发邮件，验证码填 123456")).toBeVisible();

  await card.getByLabel("验证码").fill("000000");
  await card.getByRole("button", { name: "登录", exact: true }).click();
  await expect(card.getByRole("alert")).toHaveText("验证码不对或已过期，请重新输入");
  await card.getByLabel("验证码").fill("123456");
  await card.getByRole("button", { name: "登录", exact: true }).click();

  await expect(card.locator(".cloud-email")).toHaveText(EMAIL);
  await expect(card.locator(".cloud-last-sync")).toContainText("最后同步");
  await expect(card.getByText("话术和账号（包括密码）会在你登录的电脑之间自动同步", { exact: false })).toBeVisible();

  // The cloud copy now holds both computers' 话术.
  const uploaded = await page.evaluate((email) => JSON.parse(localStorage.getItem("clipbox.cloud-demo.v1")).vaults[email], EMAIL);
  expect(uploaded.version).toBe(2);
  expect(uploaded.data.snippets.length).toBe(35);
  expect(uploaded.data.snippets.some((item) => item.id === "other-pc-1")).toBe(true);

  await page.getByRole("button", { name: "关闭设置" }).click();
  await page.locator("input[placeholder*=搜索]").fill("来自另一台电脑");
  await expect(page.locator(".native-row").filter({ hasText: "来自另一台电脑的话术" })).toHaveCount(1);

  // Signing out keeps everything here.
  const again = await openHome(page);
  await again.getByRole("button", { name: "退出登录" }).click();
  await expect(again.getByRole("button", { name: "登录…" })).toBeVisible();
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expect(page.locator(".native-row").filter({ hasText: "来自另一台电脑的话术" })).toHaveCount(1);
});

test("a Mac says its passwords stay on the Mac, and 注销账号 asks first and clears the cloud copy", async ({ page }) => {
  await asDesktop(page, "darwin");
  await withDemoServer(page, null);
  await seedSnippets(page);
  const card = await openHome(page);
  await card.getByRole("button", { name: "登录…" }).click();
  await card.getByLabel("邮箱").fill(EMAIL);
  await card.getByRole("button", { name: "发送验证码" }).click();
  await card.getByLabel("验证码").fill("123456");
  await card.getByRole("button", { name: "登录", exact: true }).click();
  await expect(card.getByText("账号里的密码、API 密钥和恢复码只存在这台 Mac 上", { exact: false })).toBeVisible();

  await card.getByRole("button", { name: "注销…" }).click();
  const confirm = page.getByRole("alertdialog", { name: "注销账号？" });
  await expect(confirm).toBeVisible();
  // Escape closes only the card, not Settings.
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(page.locator(".settings-dialog")).toBeVisible();
  await card.getByRole("button", { name: "注销…" }).click();
  await confirm.getByRole("button", { name: "注销" }).click();
  await expect(card.getByRole("button", { name: "登录…" })).toBeVisible();
  const vaults = await page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.cloud-demo.v1")).vaults);
  expect(vaults).toEqual({});
});

test("real installs talk to the server through the app; a server that is not ready says so plainly", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.addInitScript(() => {
    window.__cloudCalls = [];
    window.clipboxDesktop.cloudRequest = async (request) => {
      window.__cloudCalls.push(`${request.method} ${request.path}`);
      return { status: 503, text: JSON.stringify({ error: "unavailable", message: "同步服务暂时不能用，请稍后再试" }) };
    };
  });
  await seedSnippets(page);
  const card = await openHome(page);
  await expect(card.getByLabel("企业同步码")).toBeVisible();
  await card.getByRole("button", { name: "登录…" }).click();
  await expect(card.getByText("测试版不会真的发邮件", { exact: false })).toHaveCount(0);
  await card.getByLabel("邮箱").fill(EMAIL);
  await card.getByRole("button", { name: "发送验证码" }).click();
  await expect(card.getByRole("alert")).toHaveText("登录同步暂时不能用，请稍后再试");
  expect(await page.evaluate(() => window.__cloudCalls)).toEqual(["POST /api/auth/code"]);
});

test("without the app's connection (an older app) there is no sign-in", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.addInitScript(() => { delete window.clipboxDesktop.cloudRequest; });
  await seedSnippets(page);
  const card = await openHome(page);
  await expect(card.getByLabel("企业同步码")).toBeVisible();
  await expect(card.getByText("登录同步")).toHaveCount(0);
});

test("one account stays signed in on at most 3 computers: the oldest one signs out and is told why (D-069)", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.addInitScript((email) => {
    window.clipboxDesktop.cloudDemo = true;
    if (!localStorage.getItem("clipbox.cloud-demo.v1")) {
      localStorage.setItem("clipbox.cloud-demo.v1", JSON.stringify({
        vaults: {}, sent: {},
        sessions: { "demo-old-1": email, "demo-old-2": email, "demo-old-3": email },
        devices: { "demo-old-1": "Windows 电脑", "demo-old-2": "Mac 电脑", "demo-old-3": "Windows 电脑" },
      }));
    }
  }, EMAIL);
  await seedSnippets(page);
  const card = await openHome(page);
  await card.getByRole("button", { name: "登录…" }).click();
  await card.getByLabel("邮箱").fill(EMAIL);
  await card.getByRole("button", { name: "发送验证码" }).click();
  await card.getByLabel("验证码").fill("123456");
  await card.getByRole("button", { name: "登录", exact: true }).click();

  await expect(card.locator(".cloud-last-sync")).toContainText("最后同步");
  await expect(card.locator(".cloud-notice")).toHaveText("已超过 3 台，最早登录的「Windows 电脑」已自动退出登录");
  await expect(card.getByText("一个账号最多同时登录 3 台电脑。", { exact: false })).toBeVisible();
  const demo = await page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.cloud-demo.v1")));
  expect(Object.keys(demo.sessions)).toHaveLength(3);
  expect(demo.sessions["demo-old-1"]).toBeUndefined();
  expect(demo.ended["demo-old-1"]).toBe(true);

  // Later a 4th computer signs in elsewhere and ends this one: the next sync says so and shows 登录… again.
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("clipbox.cloud-demo.v1"));
    for (const token of Object.keys(state.sessions)) { delete state.sessions[token]; state.ended[token] = true; }
    localStorage.setItem("clipbox.cloud-demo.v1", JSON.stringify(state));
  });
  await card.locator(".settings-row").filter({ hasText: "已登录" }).getByRole("button", { name: "立即同步" }).click();
  await expect(card.getByRole("alert")).toHaveText("这个账号在别的电脑上登录了。一个账号最多同时登录 3 台电脑，这台电脑已退出登录，要同步请重新登录");
  await expect(card.getByRole("button", { name: "登录…" })).toBeVisible();
  await expect(card.locator(".cloud-notice")).toHaveCount(0);
});
