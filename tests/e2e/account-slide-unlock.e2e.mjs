// D-050: the 账号 page is frosted until it is slid open (on by default). It closes again on leaving the section and when
// the window hides; the 账号页密码 screen, when set, is the only gate; 设置 can turn the slide off.
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets, settle, SLIDE_UNLOCK_KEY, SLIDE_UNLOCK_ON } from "./helpers.mjs";

test.use({ storageState: SLIDE_UNLOCK_ON });

const kinds = (page) => page.locator(".kind-switch");
const knob = (page) => page.getByRole("slider", { name: "滑动解锁" });
const vault = (page) => page.getByRole("region", { name: "保险箱" });
const addButton = (page) => page.getByRole("button", { name: "新增条目" });

async function openAccounts(page) {
  await kinds(page).getByRole("button", { name: "账号" }).click();
}

async function expectVeiled(page) {
  await expect(knob(page)).toBeVisible();
  const content = page.locator(".account-veil-content");
  await expect(content).toHaveAttribute("inert", "");
  await expect(content).toHaveAttribute("aria-hidden", "true");
  // Drawn underneath but blurred, and out of reach for clicks, keys and screen readers.
  expect(await content.evaluate((el) => getComputedStyle(el).filter)).toMatch(/blur\(\d+px\)/);
  expect(await content.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  await expect(content.locator(".account-page, [aria-label='保险箱']").first()).toBeAttached();
  await expect(vault(page)).toHaveCount(0);
  await expect(addButton(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(选择|收起账号)$/ })).toHaveCount(0);
  // The rest of the window stays usable.
  await expect(page.getByRole("button", { name: "迷你模式" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /设置/ }).first()).toBeEnabled();
  await expect(page.getByPlaceholder(/搜索/).first()).toBeEnabled();
}

async function expectOpen(page) {
  await expect(page.locator(".account-veil")).toHaveCount(0);
  await expect(knob(page)).toHaveCount(0);
  await expect(vault(page)).toBeVisible();
  await expect(addButton(page)).toBeVisible();
  await expect(page.locator(".account-veil-content")).not.toHaveAttribute("inert", "");
}

// Presses the knob and moves the mouse right by `share` of the track in small steps, as a hand would.
async function slide(page, share) {
  const track = await page.locator(".slide-unlock").boundingBox();
  const box = await knob(page).boundingBox();
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const distance = (track.width - box.width - 8) * share;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step++) await page.mouse.move(startX + (distance * step) / 12, y);
  return { release: () => page.mouse.up(), startX };
}

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: the 账号 page is frosted until slid to the end; a short slide springs back`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    await openAccounts(page);
    await expectVeiled(page);
    await expect(page.locator(".slide-unlock-label")).toHaveText("向右滑动解锁");
    await expect(knob(page)).toHaveAttribute("aria-valuemin", "0");
    await expect(knob(page)).toHaveAttribute("aria-valuemax", "100");

    // Let go a third of the way: the knob follows the pointer, then springs back and the page stays frosted.
    const home = await knob(page).boundingBox();
    const short = await slide(page, 0.35);
    const held = await knob(page).boundingBox();
    expect(held.x - home.x).toBeGreaterThan(40);
    expect(Number(await knob(page).getAttribute("aria-valuenow"))).toBeGreaterThan(20);
    await short.release();
    await settle(page);
    await expect(knob(page)).toHaveAttribute("aria-valuenow", "0");
    expect(Math.abs((await knob(page).boundingBox()).x - home.x)).toBeLessThan(1);
    await expectVeiled(page);

    // All the way: the frost fades and the 账号 content can be used.
    const full = await slide(page, 1);
    await full.release();
    await expectOpen(page);
    await addButton(page).click();
    await expect(page.getByRole("menuitem").first()).toBeVisible();
    await page.locator(".menu-scrim").click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole("menuitem")).toHaveCount(0);

    // Leaving the section and coming back frosts it again.
    await kinds(page).getByRole("button", { name: "话术" }).click();
    await expect(knob(page)).toHaveCount(0);
    await expect(page.locator(".native-row").first()).toBeVisible();
    await openAccounts(page);
    await expectVeiled(page);
  });

  test(`${platform}: the focused knob opens with its own keys, and hiding the window frosts the page again`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    await openAccounts(page);
    await knob(page).focus();
    await page.keyboard.press("ArrowRight");
    await expectOpen(page);

    // Minimised or closed to the tray: the page hides, and the 账号 page is frosted when it shows again.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expectVeiled(page);
    for (const key of ["Enter", " ", "End"]) {
      await knob(page).focus();
      await page.keyboard.press(key);
      await expectOpen(page);
      await kinds(page).getByRole("button", { name: "话术" }).click();
      await openAccounts(page);
      await expectVeiled(page);
    }
    // Keys elsewhere do nothing to it: no shortcut opens the page (D-005).
    await page.getByPlaceholder(/搜索/).first().focus();
    for (const key of ["ArrowRight", "End", "Enter"]) await page.keyboard.press(key);
    await expectVeiled(page);
  });

  test(`${platform}: 设置 can turn the slide off, and it stays off after a restart`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    await page.getByRole("button", { name: /设置/ }).first().click();
    const settings = page.getByRole("dialog", { name: "设置" });
    await settings.getByRole("tab", { name: "数据" }).click();
    const row = settings.locator(".settings-row", { hasText: "打开账号页先滑动解锁" });
    await expect(row).toContainText("没滑开之前，账号内容是模糊的");
    const choice = row.getByRole("radiogroup", { name: "打开账号页先滑动解锁" });
    await expect(choice.getByRole("radio", { name: "开" })).toHaveAttribute("aria-checked", "true");
    await choice.getByRole("radio", { name: "关" }).click();
    await expect(choice.getByRole("radio", { name: "关" })).toHaveAttribute("aria-checked", "true");
    await settings.getByRole("button", { name: "关闭设置" }).click();
    expect(await page.evaluate((key) => localStorage.getItem(key), SLIDE_UNLOCK_KEY)).toBe("0");

    await openAccounts(page);
    await expect(vault(page)).toBeVisible();
    await expect(knob(page)).toHaveCount(0);
    await page.reload();
    await openAccounts(page);
    await expect(vault(page)).toBeVisible();
    await expect(knob(page)).toHaveCount(0);
  });
}

test("with the 账号页密码 set, only the password screen guards the page: no slide before or after", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "数据" }).click();
  await settings.getByRole("button", { name: "设置…" }).click();
  await settings.getByLabel("新密码", { exact: true }).fill("abcd1234");
  await settings.getByLabel("再输入一次新密码").fill("abcd1234");
  await settings.getByRole("button", { name: "保存" }).click();
  await settings.getByLabel("我已经把恢复码保存好了").check();
  await settings.getByRole("button", { name: "完成" }).click();
  await expect(settings.locator(".settings-row", { hasText: "打开账号页先滑动解锁" })).toContainText("已设账号页密码，现在只需输入密码");
  await settings.getByRole("button", { name: "关闭设置" }).click();

  await openAccounts(page);
  const lock = page.getByRole("form", { name: "账号页已上锁" });
  await expect(lock).toBeVisible();
  await expect(knob(page)).toHaveCount(0);
  await lock.getByLabel("账号页密码").fill("abcd1234");
  await lock.getByRole("button", { name: "打开" }).click();
  await expect(vault(page)).toBeVisible();
  await expect(knob(page)).toHaveCount(0);
  await expect(page.locator(".account-veil")).toHaveCount(0);
});

test("the mini window is left as it was: no slide there", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  await openAccounts(page);
  await expect(knob(page)).toBeVisible();
  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  await expect(knob(page)).toHaveCount(0);
  await expect(page.locator(".account-veil")).toHaveCount(0);
});

test("with reduced motion the page opens at once, without the shimmer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await openAccounts(page);
  expect(await page.locator(".slide-unlock-label").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  const full = await slide(page, 1);
  await full.release();
  await expectOpen(page);
});
