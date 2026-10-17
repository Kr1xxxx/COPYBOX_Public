import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

async function setup(page) {
  await asDesktop(page, "darwin");
  await page.addInitScript(() => {
    window.__mcpAnswers = {};
    window.clipboxDesktop.onAutomationCommand = (callback) => { window.__mcpSend = callback; return () => {}; };
    window.clipboxDesktop.respondAutomationCommand = (id, answer) => { window.__mcpAnswers[id] = answer; };
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
  await page.evaluate(() => { window.__restoreMcpDecoder(); window.__releaseMcpDecode(); });
  expect((await pending).results[0].status).toBe("imported");
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
  await page.screenshot({ path: "/tmp/copyboxx-mcp-image-verified.png" });
  await page.reload(); await page.waitForFunction(() => typeof window.__mcpSend === "function");
  const listed = await send(page, { action: "image-list" });
  expect(listed.total).toBe(1); expect(listed.items[0].title).toBe("MCP edited image");
  expect(await send(page, { action: "image-folder-rename", from: "MCP samples", to: "MCP renamed" })).toMatchObject({ ok: true });
  expect((await send(page, { action: "image-folders" })).folders).toEqual([{ name: "MCP renamed", count: 0 }]);
});
