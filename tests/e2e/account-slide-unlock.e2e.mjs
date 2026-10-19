// D-051: the 账号 page is frosted until it is slid open (on by default). It closes again on leaving the section and when
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

// Presses the knob and moves the mouse right by `share` of the track in small steps, as a hand would. `steps` few and
// large make a fast flick; `release({ still: true })` holds the mouse still first, so the release carries no fling
// (the release velocity only counts the last 80 ms of movement).
async function slide(page, share, { steps = 12 } = {}) {
  const track = await page.locator(".slide-unlock").boundingBox();
  const box = await knob(page).boundingBox();
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const distance = (track.width - box.width - 8) * share;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) await page.mouse.move(startX + (distance * step) / steps, y);
  return {
    release: async ({ still = false } = {}) => { if (still) await page.waitForTimeout(150); await page.mouse.up(); },
    moveTo: (nextShare) => page.mouse.move(startX + (track.width - box.width - 8) * nextShare, y, { steps: 6 }),
    startX,
    travel: track.width - box.width - 8,
  };
}

// Waits until the knob has stopped moving (the springs run in JS, so poll its position).
async function knobAtRest(page) {
  let last = null;
  await expect.poll(async () => {
    const box = await knob(page).boundingBox();
    const same = last !== null && Math.abs(box.x - last) < 0.25;
    last = box.x;
    return same;
  }, { intervals: [60] }).toBe(true);
}

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: the 账号 page is frosted until slid to the end; a short slide springs back`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    await openAccounts(page);
    await expectVeiled(page);
    // Frosted, the 账号 sidebar cannot switch views (D-077).
    await expect(page.getByRole("navigation", { name: "分类" }).getByRole("button").first()).toBeDisabled();
    await expect(page.getByRole("navigation", { name: "快捷入口" }).getByRole("button").first()).toBeDisabled();
    await expect(page.getByRole("button", { name: /^回收站/ })).toBeDisabled();
    await expect(page.locator(".slide-unlock-label")).toHaveText("向右滑动解锁");
    await expect(knob(page)).toHaveAttribute("aria-valuemin", "0");
    await expect(knob(page)).toHaveAttribute("aria-valuemax", "100");

    // Let go a third of the way: the knob follows the pointer, then springs back and the page stays frosted.
    const home = await knob(page).boundingBox();
    const short = await slide(page, 0.35);
    const held = await knob(page).boundingBox();
    expect(held.x - home.x).toBeGreaterThan(40);
    expect(Number(await knob(page).getAttribute("aria-valuenow"))).toBeGreaterThan(20);
    // The accent fill grows out from behind the knob: its right edge rides the knob's right edge.
    const fill = await page.locator(".slide-unlock-fill").boundingBox();
    expect(Math.abs(fill.x + fill.width - (held.x + held.width))).toBeLessThan(2);
    await expect(page.locator(".slide-unlock")).not.toHaveAttribute("data-armed", "");
    // Stopped before letting go, so this is not a flick.
    await short.release({ still: true });
    await settle(page);
    await expect(knob(page)).toHaveAttribute("aria-valuenow", "0");
    expect(Math.abs((await knob(page).boundingBox()).x - home.x)).toBeLessThan(1);
    await expectVeiled(page);

    // All the way: the frost fades and the 账号 content can be used.
    const full = await slide(page, 1);
    await full.release();
    await expectOpen(page);
    await expect(page.getByRole("navigation", { name: "分类" }).getByRole("button").first()).toBeEnabled();
    await addButton(page).click();
    await expect(page.getByRole("menuitem").first()).toBeVisible();
    await page.locator(".menu-scrim").click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole("menuitem")).toHaveCount(0);

    // Leaving the section and coming back keeps it open: only the auto-lock timer frosts it again (D-077).
    await kinds(page).getByRole("button", { name: "话术" }).click();
    await expect(knob(page)).toHaveCount(0);
    await expect(page.locator(".native-row").first()).toBeVisible();
    await openAccounts(page);
    await expectOpen(page);
  });

  test(`${platform}: the focused knob opens with its own keys, and hiding the window frosts the page again`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    await openAccounts(page);
    await knob(page).focus();
    await page.keyboard.press("ArrowRight");
    await expectOpen(page);

    // Minimised or closed to the tray: the page hides, and the 账号 page is frosted when it shows again.
    const hideAndShow = () => page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await hideAndShow();
    await expectVeiled(page);
    for (const key of ["Enter", " ", "End"]) {
      await knob(page).focus();
      await page.keyboard.press(key);
      await expectOpen(page);
      await hideAndShow();
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
    await settings.getByRole("tab", { name: "安全" }).click();
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
  await settings.getByRole("tab", { name: "安全" }).click();
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

// The swipe-actions feel (arc-library): a fast flick opens even short of the end, the knob stops at either end of the
// track (owner, 2026-10-14), past the threshold the fill covers the track, and a slow release just short of the threshold springs home.
test("a fast flick that does not reach the threshold still opens the page", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await openAccounts(page);
  await expectVeiled(page);
  // Three large steps to half the track (well short of the 88 % threshold), let go at once: the projected travel passes it.
  // Recorded on the knob as it happens, since nothing may run between the last move and the release.
  await knob(page).evaluate((el) => {
    window.__slideSeen = { max: 0, armed: false };
    el.addEventListener("pointerup", () => {
      window.__slideSeen = { max: Number(el.getAttribute("aria-valuenow")), armed: el.parentElement.hasAttribute("data-armed") };
    }, { capture: true, once: true });
  });
  const flick = await slide(page, 0.5, { steps: 3 });
  await flick.release();
  const seen = await page.evaluate(() => window.__slideSeen);
  expect(seen.max).toBeLessThan(60);
  expect(seen.armed).toBe(false);
  await expectOpen(page);
});

test("a slow release just short of the threshold springs home and stays frosted", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await openAccounts(page);
  const home = await knob(page).boundingBox();
  const near = await slide(page, 0.8, { steps: 24 });
  expect(Number(await knob(page).getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(75);
  expect(Number(await knob(page).getAttribute("aria-valuenow"))).toBeLessThan(88);
  await expect(page.locator(".slide-unlock")).not.toHaveAttribute("data-armed", "");
  // The frost lightens a little with the knob, but stays a heavy blur.
  const blur = Number((await page.locator(".account-veil-content").evaluate((el) => getComputedStyle(el).filter)).match(/blur\(([\d.]+)px\)/)[1]);
  expect(blur).toBeGreaterThanOrEqual(12);
  expect(blur).toBeLessThan(16);
  await near.release({ still: true });
  await expect(knob(page)).toHaveAttribute("aria-valuenow", "0");
  await knobAtRest(page);
  expect(Math.abs((await knob(page).boundingBox()).x - home.x)).toBeLessThan(1);
  await expectVeiled(page);
});

test("past either end the knob stays on the track; armed, the fill covers the track, and backing off a little keeps it armed", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await openAccounts(page);
  const track = page.locator(".slide-unlock");
  const bounds = await track.boundingBox();
  const home = await knob(page).boundingBox();

  // Pulled well past the start: it stays at the start.
  await page.mouse.move(home.x + home.width / 2, home.y + home.height / 2);
  await page.mouse.down();
  await page.mouse.move(home.x + home.width / 2 - 120, home.y + home.height / 2, { steps: 8 });
  const left = await knob(page).boundingBox();
  expect(Math.abs(left.x - home.x)).toBeLessThan(1);
  await expect(knob(page)).toHaveAttribute("aria-valuenow", "0");
  await page.waitForTimeout(150);
  await page.mouse.up();
  await knobAtRest(page);
  expect(Math.abs((await knob(page).boundingBox()).x - home.x)).toBeLessThan(1);
  await expectVeiled(page);

  // Pulled twice the track's length: the knob stops at the end and never leaves the track (the inside of the track
  // ends 5 px before its outer edge: 1 px border, 4 px padding).
  const pull = await slide(page, 2, { steps: 24 });
  const far = await knob(page).boundingBox();
  const end = bounds.x + bounds.width - 5;
  expect(far.x + far.width).toBeGreaterThan(end - 1);
  expect(far.x + far.width).toBeLessThanOrEqual(end + 0.5);
  await expect(knob(page)).toHaveAttribute("aria-valuenow", "100");
  await expect(track).toHaveAttribute("data-armed", "");
  // The fill springs over the whole inside of the track.
  await expect.poll(async () => { const fill = await page.locator(".slide-unlock-fill").boundingBox(); return fill.x + fill.width >= end - 1; }).toBe(true);

  // Back to just under the threshold: still armed (20 px of hysteresis), so letting go opens it.
  await pull.moveTo(0.86);
  await expect(track).toHaveAttribute("data-armed", "");
  await pull.release({ still: true });
  await expectOpen(page);
});
