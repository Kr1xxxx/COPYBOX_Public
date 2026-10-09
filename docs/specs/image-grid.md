# Spec: 图片 nine-grid (九宫格)

Owner request (2026-10-09): "图片哪里给我做成九宫格". Applies to the 图片 section on both platforms. Recorded as D-019.

## What the user sees

- **Default view = 宫格**: thumbnails in a grid of **3 columns** (the full window is at least 680 px wide, so the content
  panel always has room for 3). Square tiles, `object-fit: cover`, rounded corners, a hairline border. Title under the
  tile (one line, ellipsis). Gap about 10 px. Scrolls inside the panel (hidden scrollbar, fade hint like the other lists).
- A small segmented switch at the right of the section header: `宫格 | 列表` (icon buttons with `aria-label`
  `宫格视图` / `列表视图`). `列表` is today's list, unchanged. The choice is remembered per browser/device
  (`localStorage` key `clipbox.image-view`, values `grid` / `list`, wrapped in try/catch, default `grid`).
- **Copy from the tile**: a round icon button (same copy glyph as the list) sits in the tile's top-right corner, always
  visible (about 70 % opacity, full on hover/focus). It copies the picture exactly like the list's copy button (PNG to the
  clipboard, toast `已复制`, `markUsed`, `didCopy`). It is a separate focusable button with
  `aria-label="复制 <title>"`.
- **Open a tile**: clicking the tile (anywhere except the copy button) selects it: the tile gets the accent ring and the
  same detail card the list shows (large preview, size line, `目录` chip, `复制` / `改名` / `⋯` / `删除`) appears as a
  full-width item (`grid-column: 1 / -1`) right after the last tile of that row. Clicking another tile moves the card;
  clicking the selected tile again closes it. Opening a card scrolls it into view (as the list does). Delete, rename,
  move-to-folder, folder filter, search, add / drop / paste all behave exactly as in the list.
- Folder views, 全部图片, 未分类 and the empty states use the same grid.
- **Mini window (360×440)**: the same grid with 3 compact columns (gap 8 px, title 11 px), no detail card; clicking a
  tile copies it (as the mini list does). The `宫格 | 列表` switch is not shown in mini; mini keeps its own layout (grid).
- Extreme pictures (1920×480, 300×3000, 128×128, 3000×2000) look right in a tile (cover crop) and in the detail card
  (contain, bounded box, no overflow).
- No keyboard shortcut hints (D-005). Short plain Chinese.

## Not in scope

Drag-sorting images, multi-select, changing the number of columns.
