import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { seedSnippets } from "./helpers.mjs";

const V1 = fileURLToPath(new URL("../../docs/samples/shared-library-v1.json", import.meta.url));
const V2 = fileURLToPath(new URL("../../docs/samples/shared-library-v2.json", import.meta.url));

async function syncFile(page, file) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.getByRole("dialog", { name: "设置" }).getByRole("tab", { name: "数据" }).click();
  const dialog = page.locator(".settings-dialog");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), dialog.getByRole("button", { name: "选公司文件…" }).click()]);
  await chooser.setFiles(file);
  const summary = dialog.locator(".shared-summary");
  await expect(summary).toBeVisible();
  const text = await summary.innerText();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  return text;
}

test.beforeEach(async ({ page }) => { await seedSnippets(page); });

test("the shared library adds new entries, updates untouched ones, keeps edited ones and only marks removed ones", async ({ page }) => {
  const before = await page.locator(".native-row").count();
  expect(await syncFile(page, V1)).toContain("新增 3 条");
  await expect(page.locator(".native-row")).toHaveCount(before + 3);
  expect(await syncFile(page, V1)).toContain("已是最新");
  await expect(page.locator(".native-row")).toHaveCount(before + 3);

  // the employee rewrites one company 话术
  await page.locator(".native-row", { hasText: "公司 · 开场问候" }).locator(".row-main").click();
  await page.locator(".native-row.selected:not(.closing-row)").getByRole("button", { name: "编辑" }).click();
  await page.locator(".inline-editor textarea").first().fill("My own greeting for [Name]");
  await page.locator(".inline-editor .editor-save").first().click();

  const second = await syncFile(page, V2);
  expect(second).toContain("新增 1 条");
  expect(second).toContain("更新 1 条");
  expect(second).toContain("1 条你改过的保留了你的版本");
  expect(second).toContain("1 条公司已停用");
  await expect(page.locator(".native-row")).toHaveCount(before + 4);

  // untouched entry changed, removed entry is still there with a mark
  await page.locator(".native-row", { hasText: "公司 · 样品费说明" }).locator(".row-main").click();
  await expect(page.locator(".native-row.selected:not(.closing-row)")).toContainText("Shipping is paid by the buyer");
  await expect(page.locator(".native-row", { hasText: "公司 · 付款方式" }).locator(".row-shared-mark")).toHaveText("公司已停用");

  // the edited entry keeps the employee's text and offers the company version
  const mine = page.locator(".native-row", { hasText: "公司 · 开场问候" });
  await expect(mine.locator(".row-shared-mark")).toHaveText("公司版有更新");
  await mine.locator(".row-main").click();
  const notice = page.locator(".native-row.selected:not(.closing-row) .shared-notice");
  await expect(notice).toContainText("My own greeting for [Name]");
  await expect(notice).toContainText("Are you looking for lashes");
  await notice.getByRole("button", { name: "保留我的" }).click();
  await expect(page.locator(".native-row.selected:not(.closing-row) .shared-notice")).toHaveCount(0);
  await expect(page.locator(".native-row.selected:not(.closing-row)")).toContainText("My own greeting");

  // personal 话术 from the sample sheet were never touched
  await expect(page.locator(".native-row")).toHaveCount(before + 4);
});

test("choosing the company version replaces the edited text", async ({ page }) => {
  await syncFile(page, V1);
  await page.locator(".native-row", { hasText: "公司 · 开场问候" }).locator(".row-main").click();
  await page.locator(".native-row.selected:not(.closing-row)").getByRole("button", { name: "编辑" }).click();
  await page.locator(".inline-editor textarea").first().fill("Edited greeting [Name]");
  await page.locator(".inline-editor .editor-save").first().click();
  await syncFile(page, V2);
  await page.locator(".native-row", { hasText: "公司 · 开场问候" }).locator(".row-main").click();
  await page.locator(".native-row.selected:not(.closing-row) .shared-notice").getByRole("button", { name: "用公司版" }).click();
  await expect(page.locator(".native-row.selected:not(.closing-row)")).toContainText("Are you looking for lashes");
  await expect(page.locator(".native-row.selected:not(.closing-row) .shared-notice")).toHaveCount(0);
});

test("a wrong file changes nothing and says so; the address field starts empty", async ({ page }) => {
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.getByRole("dialog", { name: "设置" }).getByRole("tab", { name: "数据" }).click();
  const dialog = page.locator(".settings-dialog");
  await expect(dialog.locator("#shared-url")).toHaveValue("");
  await expect(dialog.getByRole("button", { name: "立即同步" })).toBeDisabled();
  const before = await page.locator(".native-row").count();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), dialog.getByRole("button", { name: "选公司文件…" }).click()]);
  await chooser.setFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("not json") });
  await expect(dialog.locator(".shared-error")).toContainText("这不是有效的公司话术库文件");
  await page.keyboard.press("Escape");
  await expect(page.locator(".native-row")).toHaveCount(before);
});

test("an address syncs on 立即同步 and again by itself on the next start, quietly when nothing changed", async ({ page }) => {
  const library = await import("node:fs").then((fs) => fs.readFileSync(V1, "utf8"));
  await page.route("https://company.example/library.json", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: library }));
  const before = await page.locator(".native-row").count();
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.getByRole("dialog", { name: "设置" }).getByRole("tab", { name: "数据" }).click();
  const dialog = page.locator(".settings-dialog");
  await dialog.locator("#shared-url").fill("https://company.example/library.json");
  await dialog.getByRole("button", { name: "立即同步" }).click();
  await expect(dialog.locator(".shared-summary")).toContainText("新增 3 条");
  await page.keyboard.press("Escape");
  await expect(page.locator(".native-row")).toHaveCount(before + 3);
  // next start: the address is remembered, the sync runs again and finds nothing new (no duplicates)
  await page.reload();
  await page.waitForSelector(".native-row");
  await page.waitForTimeout(800);
  await expect(page.locator(".native-row")).toHaveCount(before + 3);
  await expect(page.getByText("共享话术已同步")).toHaveCount(0);
});
