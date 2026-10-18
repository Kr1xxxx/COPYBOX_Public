import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

async function setup(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await asDesktop(page, "darwin");
  await page.addInitScript(() => {
    window.__mcpAnswers = {};
    window.clipboxDesktop.onAutomationCommand = (callback) => { window.__mcpSend = callback; return () => {}; };
    window.clipboxDesktop.respondAutomationCommand = (id, answer) => { window.__mcpAnswers[id] = answer; };
    window.__mcpFlushHandlers = new Set(); window.__mcpFlushDone = 0;
    window.clipboxDesktop.onFlushRequest = (handler) => { window.__mcpFlushHandlers.add(handler); return () => window.__mcpFlushHandlers.delete(handler); };
    window.clipboxDesktop.flushDone = () => { window.__mcpFlushDone += 1; };
  });
  await seedSnippets(page);
  await page.waitForFunction(() => typeof window.__mcpSend === "function");
}
let serial = 0;
async function send(page, command) {
  const id = `mcp-test-${++serial}`;
  await page.evaluate(([requestId, command]) => window.__mcpSend({ requestId, command }), [id, command]);
  await page.waitForFunction((id) => window.__mcpAnswers[id] !== undefined, id);
  return page.evaluate((id) => window.__mcpAnswers[id], id);
}

test("MCP batch snippets save once, reject stale edits and survive reload", async ({ page }) => {
  await setup(page);
  const folders = await send(page, { action: "snippet-folders" });
  expect(folders.ok).toBe(true);
  const listed = await send(page, { action: "list" });
  expect(listed.ok).toBe(true);
  const numbers = listed.items.slice(0, 2).map((item) => item.number);
  const before = await send(page, { action: "get-many", numbers });
  expect(before.items).toHaveLength(2);
  const updates = before.items.map((item, index) => ({ number: item.number, expectedUpdatedAt: item.updatedAt, title: `MCP synthetic ${index}`, content: `Synthetic reply ${index}` }));
  const saved = await send(page, { action: "update-many", updates });
  expect(saved.ok).toBe(true);
  const stale = await send(page, { action: "update-many", updates });
  expect(stale).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  await page.reload();
  await page.waitForFunction(() => typeof window.__mcpSend === "function");
  const after = await send(page, { action: "get-many", numbers });
  expect(after.items.map((item) => item.content)).toEqual(["Synthetic reply 0", "Synthetic reply 1"]);
});

test("MCP imports locally before image tab opens, deduplicates, organizes and returns a real bounded preview", async ({ page }) => {
  await setup(page);
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 400;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#2468af"; ctx.fillRect(0, 0, 640, 400);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  expect(await send(page, { action: "image-folder-create", name: "MCP samples" })).toMatchObject({ ok: true });
  const file = { path: "/synthetic/sample.png", sourceName: "sample.png", data, mimeType: "image/png", title: "Synthetic image", folder: "MCP samples" };
  // Hold the decoder briefly: a second image operation refuses promptly while legacy snippet reads still work.
  await page.evaluate(() => {
    const original = window.createImageBitmap;
    window.createImageBitmap = async (...args) => { await new Promise((resolve) => { window.__releaseMcpDecode = resolve; }); return original(...args); };
    window.__restoreMcpDecoder = () => { window.createImageBitmap = original; };
  });
  const pending = send(page, { action: "image-import", files: [file] });
  await page.waitForFunction(() => typeof window.__releaseMcpDecode === "function");
  expect(await send(page, { action: "image-folders" })).toMatchObject({ ok: false, error: { code: "IMAGE_BUSY" } });
  expect(await send(page, { action: "status" })).toMatchObject({ ok: true });
  await page.evaluate(async () => { for (const handler of window.__mcpFlushHandlers) handler(); await new Promise((resolve) => setTimeout(resolve, 80)); });
  expect(await page.evaluate(() => window.__mcpFlushDone)).toBe(0);
  await page.evaluate(() => { window.__restoreMcpDecoder(); window.__releaseMcpDecode(); });
  expect((await pending).results[0].status).toBe("imported");
  await expect.poll(() => page.evaluate(() => window.__mcpFlushDone)).toBe(1);
  const imported = await send(page, { action: "image-import", files: [file, { ...file, path: "/synthetic/bad.png", data: "bm90IGFuIGltYWdl" }] });
  expect(imported.results.map((item) => item.status)).toEqual(["duplicate", "error"]);
  const original = imported.results[0].item;
  expect(original).toMatchObject({ width: 640, height: 400, folder: "MCP samples" });
  expect((await send(page, { action: "image-import", files: [file] })).results[0].status).toBe("duplicate");
  const edited = await send(page, { action: "image-update-many", updates: [{ id: original.id, expectedUpdatedAt: original.updatedAt, title: "MCP edited image", folder: null }] });
  expect(edited.results[0].status).toBe("updated");
  const preview = await send(page, { action: "image-thumbnail", id: original.id });
  expect(preview.ok).toBe(true);
  const size = await page.evaluate(async (preview) => {
    const image = new Image(); image.src = `data:${preview.mimeType};base64,${preview.data}`; await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, preview.preview);
  expect(size).toEqual([320, 200]);
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(page.getByText("MCP edited image", { exact: true }).first()).toBeVisible();
  await expect.poll(() => page.locator(".image-tile-pic").evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: "/tmp/copyboxx-mcp-image-verified.png", animations: "disabled" });
  await page.reload(); await page.waitForFunction(() => typeof window.__mcpSend === "function");
  const listed = await send(page, { action: "image-list" });
  expect(listed.total).toBe(1); expect(listed.items[0].title).toBe("MCP edited image");
  expect(await send(page, { action: "image-folder-rename", from: "MCP samples", to: "MCP renamed" })).toMatchObject({ ok: true });
  expect((await send(page, { action: "image-folders" })).folders).toEqual([{ name: "MCP renamed", count: 0 }]);
});


test("MCP creates usable snippet folders and renames them with pins preserved after reload", async ({ page }) => {
  await setup(page);
  expect(await send(page, { action: "snippet-folder-create", name: "MCP custom" })).toMatchObject({ ok: true, created: true });
  const added = await send(page, { action: "add", title: "Synthetic custom reply", content: "Synthetic reply", folder: "MCP custom" });
  expect(added.ok).toBe(true);
  await page.evaluate(() => localStorage.setItem("clipbox.folder-pins.v1", JSON.stringify({ snippet: ["MCP custom"] })));
  await page.reload(); await page.waitForFunction(() => typeof window.__mcpSend === "function");
  await page.locator(".directory-main").filter({ hasText: "MCP custom" }).click();
  expect(await send(page, { action: "snippet-folder-rename", from: "MCP custom", to: "MCP renamed" })).toMatchObject({ ok: true, name: "MCP renamed" });
  await expect(page.locator(".directory-row.active")).toContainText("MCP renamed");
  expect((await send(page, { action: "get", number: added.item.number })).item.folder).toBe("MCP renamed");
  await page.reload(); await page.waitForFunction(() => typeof window.__mcpSend === "function");
  const folders = (await send(page, { action: "snippet-folders" })).folders;
  expect(folders).toContainEqual({ name: "MCP renamed", count: 1 });
  expect(folders.some((folder) => folder.name === "MCP custom")).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.folder-pins.v1")).snippet)).toEqual(["MCP renamed"]);
  expect((await send(page, { action: "get", number: added.item.number })).item.content).toBe("Synthetic reply");
});

test("switching sections keeps the same outside command listener, and a rename still follows the open folder", async ({ page }) => {
  await setup(page);
  expect(await send(page, { action: "snippet-folder-create", name: "MCP door" })).toMatchObject({ ok: true, created: true });
  await page.evaluate(() => { window.__mcpFirst = window.__mcpSend; });
  // The real bridge subscribes asynchronously: a fresh listener per section switch leaves a gap where commands are lost.
  for (const section of ["图片", "账号", "话术"]) await page.locator(".kind-switch").getByRole("button", { name: section }).click();
  expect(await page.evaluate(() => window.__mcpSend === window.__mcpFirst)).toBe(true);
  await page.locator(".directory-main").filter({ hasText: "MCP door" }).click();
  expect(await send(page, { action: "snippet-folder-rename", from: "MCP door", to: "MCP door renamed" })).toMatchObject({ ok: true, name: "MCP door renamed" });
  await expect(page.locator(".directory-row.active")).toContainText("MCP door renamed");
});

for (const [canonical, supplied] of [["Products", "products"], ["产品资料", " 产品资料 "]]) {
  test(`MCP image folder rename keeps selection and counts for alias ${supplied}`, async ({ page }) => {
    await setup(page);
    const data = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 32;
      canvas.getContext("2d").fillRect(0, 0, 32, 32);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    expect(await send(page, { action: "image-folder-create", name: canonical })).toMatchObject({ ok: true });
    const imported = await send(page, { action: "image-import", files: [{ path: "/synthetic/rename.png", sourceName: "rename.png", mimeType: "image/png", data, title: "Synthetic rename image", folder: canonical }] });
    expect(imported.results[0].status).toBe("imported");
    await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
    const folder = (name) => page.locator(".sidebar .directory-row").filter({ has: page.locator(".directory-main", { hasText: name }) });
    await page.getByRole("button", { name: `管理目录 ${canonical}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "置顶", exact: true }).click();
    await folder(canonical).locator(".directory-main").click();
    await expect(page.locator(".image-tile")).toHaveCount(1);
    expect(await send(page, { action: "image-folder-rename", from: supplied, to: "Renamed" })).toMatchObject({ ok: true });
    await expect(folder("Renamed").locator("b")).toHaveText("1");
    await expect(folder("Renamed")).toHaveClass(/pinned/);
    await expect(folder("Renamed").locator(".directory-main")).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".image-tile")).toHaveCount(1);
    await page.reload();
    await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
    await expect(folder("Renamed")).toHaveClass(/pinned/);
    await folder("Renamed").locator(".directory-main").click();
    await expect(page.locator(".image-tile")).toHaveCount(1);
  });
}
