// The 图片 view choice (宫格 | 列表, docs/specs/image-grid.md) and the grid arithmetic.
// Pure helpers: the storage object is passed in, so they can be tested without a browser.

export type ImageView = "grid" | "list";

export const IMAGE_VIEW_KEY = "clipbox.image-view";
export const IMAGE_GRID_COLUMNS = 4;

type ViewStorage = Pick<Storage, "getItem" | "setItem">;

// Anything that is not exactly "list" (missing, empty, a stale value) means the default: 宫格.
export function parseImageView(raw: unknown): ImageView {
  return raw === "list" ? "list" : "grid";
}

function browserStorage(): ViewStorage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export function readImageView(storage: ViewStorage | null = browserStorage()): ImageView {
  try { return parseImageView(storage?.getItem(IMAGE_VIEW_KEY)); } catch { return "grid"; }
}

export function writeImageView(view: ImageView, storage: ViewStorage | null = browserStorage()) {
  try { storage?.setItem(IMAGE_VIEW_KEY, view); } catch { /* keep the choice for this session only */ }
}

// Where the full-width detail card goes: right after the last tile of the selected tile's row.
// The result is a position in the tile list (0..length); -1 when nothing is selected.
export function gridCardInsertIndex(selectedIndex: number, length: number, columns = IMAGE_GRID_COLUMNS) {
  if (selectedIndex < 0 || selectedIndex >= length) return -1;
  return Math.min(Math.ceil((selectedIndex + 1) / columns) * columns, length);
}

/**
 * How far to scroll (positive = down) so the clicked picture stays fully visible once its detail card has opened.
 * Prefers showing the whole span from the picture to the end of the card; when that is taller than the view, the
 * picture goes to the top so it is never pushed out of sight.
 */
export function detailScrollDelta(viewTop: number, viewBottom: number, itemTop: number, endBottom: number, pad = 6): number {
  const top = viewTop + pad;
  const bottom = viewBottom - pad;
  if (endBottom - itemTop > bottom - top) return itemTop - top;
  if (itemTop < top) return itemTop - top;
  if (endBottom > bottom) return endBottom - bottom;
  return 0;
}
