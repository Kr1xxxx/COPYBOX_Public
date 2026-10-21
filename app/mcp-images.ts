// MCP adapters only: all writes still use the image library's existing encrypted persistence and UI updates.
import { AutomationCommandError } from "./clipbox-automation.ts";
import type { ImageLibrary } from "./image-library";
import { IMAGE_MAX_BYTES, IMAGE_TYPES, normalizeFolderName, normalizeImageTitle, titleFromFileName, type ImageMeta, type ImageStore } from "./image-store.ts";
import { batch, distinct, hasAction, integer, mcpError, record, text } from "./mcp-input.ts";

const ACTIONS = ["image-list", "image-import", "image-thumbnail", "image-update-many", "image-folders", "image-folder-create", "image-folder-rename"];
export const isMcpImageCommand = (value: unknown) => hasAction(value, ACTIONS);
type Library = Pick<ImageLibrary, "addImage" | "updateImage" | "createFolder" | "renameFolder">;
type Dependencies = {
  store: Pick<ImageStore, "list" | "listFolders" | "getBlob">;
  library: Library;
  validateImage?: (blob: Blob) => Promise<void>;
  thumbnail?: (blob: Blob) => Promise<Blob | null>;
};
const active = (items: ImageMeta[]) => items.filter((item) => item.deletedAt === undefined);
const failure = (error: unknown) => ({ code: error instanceof AutomationCommandError ? error.code : "IMAGE_FAILED", message: error instanceof Error && /[一-鿿]/.test(error.message) ? error.message : "图片操作失败，请检查后重试" });

async function decoded(blob: Blob) {
  let source: ImageBitmap | HTMLImageElement;
  let close: () => void;
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    source = bitmap; close = () => bitmap.close();
  } else {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.src = url;
    try { await image.decode(); } catch (error) { URL.revokeObjectURL(url); throw error; }
    source = image; close = () => URL.revokeObjectURL(url);
  }
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!width || !height || width * height > 40_000_000) { close(); mcpError("INVALID_IMAGE", "图片无法读取或像素过大"); }
  return { source, width, height, close };
}

async function validateImage(blob: Blob) { const image = await decoded(blob); image.close(); }
// Always re-encode a bounded preview; getThumb() can return the original and is deliberately not used here.
async function thumbnail(blob: Blob): Promise<Blob | null> {
  const image = await decoded(blob);
  try {
    const scale = Math.min(1, 320 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } finally { image.close(); }
}

function preparedBlob(file: Record<string, unknown>) {
  const data = text(file.data, "图片内容");
  const type = text(file.mimeType, "图片类型");
  if (!IMAGE_TYPES.includes(type) || !data || data.length > Math.ceil(IMAGE_MAX_BYTES / 3) * 4 || data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) mcpError("INVALID_IMAGE", "图片内容或类型无效");
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  if (!bytes.length || bytes.length > IMAGE_MAX_BYTES) mcpError("INVALID_IMAGE", "图片太大，最多 10 MB");
  return new Blob([bytes], { type });
}
async function digest(blob: Blob) { return new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())).join(","); }
async function current(store: Dependencies["store"], id: string) {
  const item = active(await store.list()).find((entry) => entry.id === id);
  if (!item) mcpError("NOT_FOUND", "找不到这张图片");
  return item;
}
async function folderValue(store: Dependencies["store"], value: unknown): Promise<string | null> {
  if (value === null || value === undefined) return null;
  const name = normalizeFolderName(text(value, "目录"));
  const folder = (await store.listFolders()).find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (!folder) mcpError("NOT_FOUND", "找不到这个目录");
  return folder.name;
}

export async function runMcpImageCommand(input: unknown, deps: Dependencies) {
  const action = (input as { action?: unknown })?.action;
  const { store, library } = deps;
  if (action === "image-list") {
    const cmd = record(input, ["action", "query", "folder", "offset", "limit"]);
    const offset = cmd.offset === undefined ? 0 : integer(cmd.offset, "起始位置");
    const limit = cmd.limit === undefined ? 50 : integer(cmd.limit, "数量", 1, 100);
    const query = cmd.query === undefined ? "" : text(cmd.query, "搜索内容").trim().toLowerCase();
    const folder = cmd.folder === undefined ? undefined : text(cmd.folder, "目录");
    const items = active(await store.list()).filter((item) => (folder === undefined || (item.folder ?? "") === folder) && (!query || item.title.toLowerCase().includes(query)));
    return { action, total: items.length, offset, items: items.slice(offset, offset + limit) };
  }
  if (action === "image-folders") {
    record(input, ["action"]);
    const items = active(await store.list());
    return { action, folders: (await store.listFolders()).map((folder) => ({ ...folder, count: items.filter((item) => item.folder === folder.name).length })), uncategorizedCount: items.filter((item) => !item.folder).length };
  }
  if (action === "image-folder-create" || action === "image-folder-rename") {
    const cmd = record(input, action === "image-folder-create" ? ["action", "name"] : ["action", "from", "to"]);
    let problem = "目录操作失败";
    const onError = (message: string) => { problem = message; };
    const name = action === "image-folder-create" ? await library.createFolder(text(cmd.name, "目录名"), onError) : await library.renameFolder(text(cmd.from, "原目录名"), text(cmd.to, "新目录名"), onError);
    if (!name) mcpError("IMAGE_FOLDER_FAILED", problem);
    return { action, name };
  }
  if (action === "image-thumbnail") {
    const cmd = record(input, ["action", "id"]);
    const item = await current(store, text(cmd.id, "图片编号"));
    const small = await (deps.thumbnail ?? thumbnail)(await store.getBlob(item.id));
    if (!small || !small.size || small.size > 512 * 1024 || !IMAGE_TYPES.includes(small.type)) mcpError("PREVIEW_FAILED", "无法生成图片预览");
    const bytes = new Uint8Array(await small.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { action, id: item.id, preview: { data: btoa(binary), mimeType: small.type } };
  }
  if (action === "image-import") {
    const cmd = record(input, ["action", "files"]);
    const files = batch(cmd.files, 10).map((entry) => record(entry, ["path", "title", "folder", "sourceName", "data", "mimeType", "error"]));
    // Reject oversize prepared payloads before decoding or saving anything.
    if (files.reduce((sum, file) => sum + (file.error === undefined ? text(file.data, "图片内容").length : 0), 0) > Math.ceil(20 * 1024 * 1024 / 3) * 4 + 40) mcpError("INVALID_IMAGE", "每次图片总大小最多 20 MB");
    const results = [];
    for (const file of files) {
      const path = text(file.path, "文件路径");
      try {
        if (file.error !== undefined) {
          const error = record(file.error, ["code", "message"]);
          mcpError(text(error.code, "错误类型"), text(error.message, "错误说明"));
        }
        const blob = preparedBlob(file);
        const folder = await folderValue(store, file.folder);
        const title = normalizeImageTitle(file.title === undefined ? titleFromFileName(text(file.sourceName, "文件名")) : text(file.title, "图片标题"), "图片");
        await (deps.validateImage ?? validateImage)(blob);
        const hash = await digest(blob);
        let duplicate: ImageMeta | undefined;
        for (const candidate of active(await store.list()).filter((item) => item.size === blob.size && item.type === blob.type)) {
          if (await digest(await store.getBlob(candidate.id)) === hash) { duplicate = candidate; break; }
        }
        const item = duplicate ?? await library.addImage(blob, title, folder);
        results.push({ path, status: duplicate ? "duplicate" : "imported", item });
      } catch (error) { results.push({ path, status: "error", error: failure(error) }); }
    }
    return { action, results };
  }
  if (action === "image-update-many") {
    const cmd = record(input, ["action", "updates"]);
    const updates = batch(cmd.updates).map((entry) => {
      const update = record(entry, ["id", "expectedUpdatedAt", "title", "folder"]);
      const id = text(update.id, "图片编号");
      const expected = integer(update.expectedUpdatedAt, "内容版本");
      if (update.title === undefined && update.folder === undefined) mcpError("INVALID_ARGUMENT", "请提供要修改的标题或目录");
      if (update.folder !== undefined && update.folder !== null) text(update.folder, "目录");
      return { id, expected, title: update.title === undefined ? undefined : text(update.title, "图片标题"), folder: update.folder };
    });
    distinct(updates.map((update) => update.id));
    const results = [];
    for (const update of updates) {
      try {
        if ((await current(store, update.id)).updatedAt !== update.expected) mcpError("CONFLICT", "图片已改变，请重新读取后修改");
        const folder = update.folder === undefined ? undefined : await folderValue(store, update.folder);
        // The store checks the version again inside its write queue, so a UI edit in between is never overwritten.
        const item = await library.updateImage(update.id, { title: update.title, folder }, update.expected);
        if (!item) mcpError("CONFLICT", "图片已改变，请重新读取后修改");
        results.push({ id: update.id, status: "updated", item });
      } catch (error) { results.push({ id: update.id, status: "error", error: failure(error) }); }
    }
    return { action, results };
  }
  mcpError("INVALID_ACTION", "不支持的命令");
}
