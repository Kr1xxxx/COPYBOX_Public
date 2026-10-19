import { expect, test } from "@playwright/test";
import { DEMO_ACTIVATION, asDesktop, seedSnippets, signInAtGate } from "./helpers.mjs";

// 登录同步 (D-064) behind the login page (D-085) against the pretend server the web preview uses (app/cloud-demo.ts):
// code 123456; an email outside example.com needs the pretend activation code. Not example.com here: the pretend
// server binds that domain to a company 话术 library (domain-library.e2e.mjs).
const EMAIL = "staff@example.org";

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

test("the app opens only after signing in: email → code → activation code for an outside email; the other computer's 话术 arrive", async ({ page }) => {
  await asDesktop(page, "win32");
  await withDemoServer(page, fromOtherComputer);
  await page.goto("/");
  const gate = page.locator(".login-card");
  await expect(gate.getByRole("heading", { name: "登录后开始使用" })).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await expect(gate.getByText("测试版不会真的发邮件，验证码填 123456", { exact: false })).toBeVisible();

  await gate.getByLabel("邮箱").fill("not-an-email");
  await gate.getByRole("button", { name: "发送验证码" }).click();
  await expect(gate.getByRole("alert")).toHaveText("邮箱格式不对，请检查一下");
  await gate.getByLabel("邮箱").fill(EMAIL);
  await gate.getByRole("button", { name: "发送验证码" }).click();
  await expect(gate.getByRole("heading", { name: "填写验证码" })).toBeVisible();
  await expect(gate.getByText("验证码已发到")).toBeVisible();

  await gate.getByLabel("验证码", { exact: true }).fill("000000");
  await gate.getByRole("button", { name: "登录", exact: true }).click();
  await expect(gate.getByRole("alert")).toHaveText("验证码不对或已过期，请重新输入");
  await gate.getByLabel("验证码", { exact: true }).fill("123456");
  await gate.getByRole("button", { name: "登录", exact: true }).click();

  // example.org is not a company domain: an activation code is needed before anything opens.
  await expect(gate.getByRole("heading", { name: "填写激活码" })).toBeVisible();
  await expect(gate.getByText("不是公司邮箱，需要激活码才能使用", { exact: false })).toBeVisible();
  await gate.getByLabel("激活码", { exact: true }).fill("1111-2222-3333-4444");
  await gate.getByRole("button", { name: "激活" }).click();
  await expect(gate.getByRole("alert")).toHaveText("激活码不对或已经用过");
  expect(await page.evaluate(() => localStorage.getItem("clipbox.cloud-account.v1"))).toBeNull();
  await gate.getByLabel("激活码", { exact: true }).fill(DEMO_ACTIVATION.toLowerCase());
  await gate.getByRole("button", { name: "激活" }).click();
  await page.waitForSelector(".app-shell");
  await expect(page.locator(".native-row").filter({ hasText: "来自另一台电脑的话术" })).toHaveCount(1);

  // Next start: straight in, and this computer's 话术 go up too.
  await seedSnippets(page);
  const card = await openHome(page);
  await expect(card.locator(".cloud-email")).toHaveText(EMAIL);
  await expect(card.locator(".cloud-last-sync")).toContainText("最后同步");
  await expect(card.getByText("话术和账号（包括密码）会在你登录的电脑之间自动同步", { exact: false })).toBeVisible();
  await expect.poll(async () => (await page.evaluate((email) => JSON.parse(localStorage.getItem("clipbox.cloud-demo.v1")).vaults[email], EMAIL)).data.snippets.length, { timeout: 15000 }).toBe(35);

  // Signing out shows the login page again; everything here stays, and this email is activated for good.
  await card.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByRole("heading", { name: "登录后开始使用" })).toBeVisible();
  await page.getByLabel("邮箱").fill(EMAIL);
  await page.getByRole("button", { name: "发送验证码" }).click();
  await page.getByLabel("验证码", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForSelector(".app-shell");
  await expect(page.locator(".native-row").filter({ hasText: "来自另一台电脑的话术" })).toHaveCount(1);
});

test("a Mac says its passwords stay on the Mac, and 注销账号 asks first, clears the cloud copy and shows the login page", async ({ page }) => {
  await asDesktop(page, "darwin");
  await withDemoServer(page, null);
  await signInAtGate(page, EMAIL);
  await seedSnippets(page);
  const card = await openHome(page);
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
  await expect(page.getByRole("heading", { name: "登录后开始使用" })).toBeVisible();
  const vaults = await page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.cloud-demo.v1")).vaults);
  expect(vaults).toEqual({});
});

test("real installs talk to the server through the app with the 人机验证 token; a server that is not ready says so plainly", async ({ page }) => {
  await asDesktop(page, "win32");
  // Stands in for Cloudflare Turnstile: the widget passes at once with a known token.
  await page.route("https://challenges.cloudflare.com/**", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: `
    window.turnstile = { render(element, options) { element.textContent = "人机验证通过"; setTimeout(() => options.callback("stub-token"), 0); return "w1"; }, reset() {}, remove() {} };` }));
  await page.addInitScript(() => {
    window.__cloudCalls = [];
    window.clipboxDesktop.cloudRequest = async (request) => {
      window.__cloudCalls.push(`${request.method} ${request.path} ${JSON.stringify(request.body)}`);
      return { status: 503, text: JSON.stringify({ error: "unavailable", message: "同步服务暂时不能用，请稍后再试" }) };
    };
  });
  await page.goto("/");
  const gate = page.locator(".login-card");
  await expect(gate.getByText("测试版不会真的发邮件", { exact: false })).toHaveCount(0);
  await expect(gate.getByText("人机验证通过")).toBeVisible();
  await gate.getByLabel("邮箱").fill(EMAIL);
  await gate.getByRole("button", { name: "发送验证码" }).click();
  await expect(gate.getByRole("alert")).toHaveText("登录同步暂时不能用，请稍后再试");
  expect(await page.evaluate(() => window.__cloudCalls)).toEqual([`POST /api/auth/code {"email":"${EMAIL}","turnstile":"stub-token"}`]);
});

test("without the 人机验证 widget (offline) the code is not sent, and 重新加载 tries again", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.route("https://challenges.cloudflare.com/**", (route) => route.abort());
  await page.addInitScript(() => { window.clipboxDesktop.cloudRequest = async () => ({ status: 200, text: "{}" }); });
  await page.goto("/");
  const gate = page.locator(".login-card");
  await expect(gate.getByText("人机验证没有加载出来。")).toBeVisible();
  await gate.getByLabel("邮箱").fill(EMAIL);
  await gate.getByRole("button", { name: "发送验证码" }).click();
  await expect(gate.getByRole("alert")).toHaveText("人机验证没有加载出来，请检查网络后重试");
  await page.unroute("https://challenges.cloudflare.com/**");
  await page.route("https://challenges.cloudflare.com/**", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: `
    window.turnstile = { render(element, options) { element.textContent = "人机验证通过"; setTimeout(() => options.callback("stub-token"), 0); return "w1"; }, reset() {}, remove() {} };` }));
  await gate.getByRole("button", { name: "重新加载" }).click();
  await expect(gate.getByText("人机验证通过")).toBeVisible();
  await gate.getByRole("button", { name: "发送验证码" }).click();
  await expect(gate.getByRole("heading", { name: "填写验证码" })).toBeVisible();
});

test("without the app's connection (an older app) there is no sign-in and no login page", async ({ page }) => {
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
        vaults: {}, sent: {}, activated: { [email]: true },
        sessions: { "demo-old-1": email, "demo-old-2": email, "demo-old-3": email },
        devices: { "demo-old-1": "Windows 电脑", "demo-old-2": "Mac 电脑", "demo-old-3": "Windows 电脑" },
      }));
    }
  }, EMAIL);
  await signInAtGate(page, EMAIL);
  const card = await openHome(page);
  await expect(card.locator(".cloud-last-sync")).toContainText("最后同步");
  await expect(card.locator(".cloud-notice")).toHaveText("已超过 3 台，最早登录的「Windows 电脑」已自动退出登录");
  await expect(card.getByText("一个账号最多同时登录 3 台电脑。", { exact: false })).toBeVisible();
  const demo = await page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.cloud-demo.v1")));
  expect(Object.keys(demo.sessions)).toHaveLength(3);
  expect(demo.sessions["demo-old-1"]).toBeUndefined();
  expect(demo.ended["demo-old-1"]).toBe(true);

  // Later a 4th computer signs in elsewhere and ends this one: the next sync says so on the login page.
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("clipbox.cloud-demo.v1"));
    for (const token of Object.keys(state.sessions)) { delete state.sessions[token]; state.ended[token] = true; }
    localStorage.setItem("clipbox.cloud-demo.v1", JSON.stringify(state));
  });
  await card.locator(".settings-row").filter({ hasText: "已登录" }).getByRole("button", { name: "立即同步" }).click();
  await expect(page.getByRole("heading", { name: "登录后开始使用" })).toBeVisible();
  await expect(page.locator(".login-card").getByRole("alert")).toHaveText("这个账号在别的电脑上登录了。一个账号最多同时登录 3 台电脑，这台电脑已退出登录，要同步请重新登录");
});
