// 1,500 snippets, imported the way a person would (a spreadsheet): the list shows them all, ↑/↓ and folder counts
// are right, and typing in the search keeps up. Timings are printed; the bound is generous so a busy machine
// does not fail it.
import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

const COUNT = 1500;
const STAGES = ["询盘接待", "产品样品", "报价成交", "定制生产"];
const quote = (value) => `"${value.replaceAll('"', '""')}"`;

function bigSheet() {
  const header = "标题,沟通阶段,具体场景,核心动作,产品/业务,英文即时消息,中文对照,使用备注,可替换变量";
  const rows = Array.from({ length: COUNT }, (_, index) => {
    const n = String(index + 1).padStart(4, "0");
    const stage = STAGES[index % STAGES.length];
    return [`样例话术${n}｜第${n}条`, stage, `样例话术${n}`, `动作${n}`, "通用", quote(`Hello, this is sample reply number ${n} about order ${n}.`), quote(`你好，这是第 ${n} 条样例回复。`), "", ""].join(",");
  });
  return Buffer.from(`${String.fromCharCode(0xfeff)}${[header, ...rows].join("\n")}\n`, "utf8");
}

test("1,500 snippets: everything is listed, counts and ↑/↓ are right, and search keeps up with typing", async ({ page }) => {
  test.setTimeout(180_000);
  await asDesktop(page, "win32");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /导入话术表格/ }).first().click(),
  ]);
  await chooser.setFiles({ name: "大量话术.csv", mimeType: "text/csv", buffer: bigSheet() });
  await page.locator("[role=dialog]").getByRole("button", { name: `导入 ${COUNT} 条话术` }).click();
  await expect(page.locator(".toast")).toContainText(`已导入 ${COUNT} 条话术`, { timeout: 60_000 });
  const rows = page.locator(".native-row");
  await expect(rows).toHaveCount(COUNT, { timeout: 30_000 });

  // Folder counts in the sidebar: 1,500 spread over four stages.
  for (const stage of STAGES) {
    await expect(page.locator(".directory-row", { hasText: stage }).locator("b, .nav-count").first()).toHaveText(String(COUNT / STAGES.length));
  }

  // The first card cannot move up, the last cannot move down; one in the middle can do both.
  const handles = page.locator(".native-row .drag-handle");
  const menu = page.locator(".reorder-menu");
  for (const [index, up, down] of [[0, false, true], [700, true, true], [COUNT - 1, true, false]]) {
    await handles.nth(index).scrollIntoViewIfNeeded();
    await handles.nth(index).click();
    await expect(menu.getByRole("menuitem", { name: "上移" })).toBeEnabled({ enabled: up });
    await expect(menu.getByRole("menuitem", { name: "下移" })).toBeEnabled({ enabled: down });
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  }

  // Typing: each keystroke's results appear.
  const search = page.locator("input[placeholder*=搜索]");
  await search.click();
  const timings = [];
  let typed = "";
  for (const character of "1234") {
    typed += character;
    const started = Date.now();
    await page.keyboard.type(character);
    await expect(rows.first()).toContainText(typed, { timeout: 10_000 });
    await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeLessThan(COUNT);
    timings.push(Date.now() - started);
  }
  await expect(rows.first()).toContainText("样例话术1234");
  console.log(`[list-speed] ${COUNT} snippets, ms per keystroke until its results showed: ${timings.join(", ")}`);
  for (const ms of timings) expect(ms).toBeLessThan(5000);

  await search.fill("");
  await expect(rows).toHaveCount(COUNT, { timeout: 30_000 });
});
