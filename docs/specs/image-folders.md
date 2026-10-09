# Spec: 图片目录 (folders for images) + test images

Owner request (2026-10-09): "图片目录页做出来，加入十张测试图，不同尺寸的模拟". Builds on `docs/specs/image-section.md`
(D-017) — v1 had no folders. Recorded as D-018.

## What the user sees (图片 section)

- Sidebar in the 图片 view, same look and behaviour as the 话术 sidebar, minus favourites/recent/trash:
  - `全部图片 N` (all images) at the top;
  - heading `目录` with a `+` button → inline "new folder" row (name, Enter saves, Esc cancels), exactly like 话术;
  - one row per folder: colour dot, name, count, and a `⋯` menu → `重命名`, `颜色`, `删除目录…` (confirm step like 话术:
    `确认删除，N 张移到未分类`; **deleting a folder never deletes images**);
  - `未分类 N` (images without a folder) as a fixed row under the folders;
  - 设置 stays at the bottom. Folders can also be drag-sorted like 话术 if the existing pointer-reorder hook makes that cheap;
    otherwise they stay in creation order (no up/down buttons needed in v1).
- Selecting a folder filters the list; the page title shows the folder name (`全部图片` / folder / `未分类`).
- `新增图片` (and drop / paste) adds into the selected folder; in `全部图片` it adds to 未分类.
- Each image row: the `⋯` menu has `移动到` → folder list (+ `未分类`). The expanded image also has a `目录` line with the
  current folder (click → same move menu).
- Folder names: 1–20 characters, trimmed, unique (case-insensitive), at most 30 folders. Short Chinese messages on
  rejection (`目录名已存在`, `目录名最多 20 个字`, `目录最多 30 个`).
- Colours: automatic from `buildCategoryColorMap` (`app/category-colors.ts`), like 话术 folders; `颜色` menu picks from
  `CATEGORY_PALETTE`.
- Mini window: unchanged list, plus a folder `<select>` like the 话术 mini window (`全部` / folders / `未分类`).
- Wide, tall and tiny images must all look right: thumbnail = `object-fit: cover` square; expanded preview =
  `object-fit: contain` inside a box (max 260 px high, never wider than the panel), no layout jump, no overflow.
  Check 1920×480, 300×3000, 128×128 and 3000×2000 by screenshot.

## Storage (extends `app/image-store.ts`; no IndexedDB version bump, vault untouched)

- `ImageMeta` gains optional `folder?: string` (a folder *name*; absent = 未分类). It lives inside the already encrypted
  meta JSON, so old records keep working with no migration.
- Folder list: ONE more record in object store `meta` with id `"folders"`, encrypted exactly like an image meta record
  (same key, fresh IV, additional data `clipbox-images:meta:folders`), plaintext JSON `{ folders: { name: string; color?: string }[] }`.
  `list()` must skip both `"settings"` and `"folders"`; `getBlob/remove/readMeta` must refuse them as image ids.
- API additions on `ImageStore`:
  `listFolders(): Promise<ImageFolder[]>`, `createFolder(name): Promise<ImageFolder[]>`,
  `renameFolder(from, to): Promise<ImageFolder[]>` (also rewrites `folder` on images, one transaction),
  `setFolderColor(name, color): Promise<ImageFolder[]>`,
  `deleteFolder(name): Promise<ImageFolder[]>` (images → 未分类, one transaction),
  `moveImage(id, folder: string | null): Promise<ImageMeta>`,
  `add(file, title, folder?: string | null)`; plus pure helpers `normalizeFolderName`, `IMAGE_FOLDER_MAX = 30`,
  `IMAGE_FOLDER_NAME_MAX = 20`, `ImageFolder` type. Unknown folder names on `add/moveImage` are rejected.
- A record that fails to decrypt still throws a clear error and nothing is overwritten.

## Test images (preview only — not part of the product)

Ten generated pictures of different sizes/formats so the folder page can be judged. They are created by the web
preview, not shipped in the app and not committed as binaries: 微信收款码 600×600 PNG, 价目表长图 900×2400 PNG,
产品主图 1200×1200 JPG, 横幅 1920×480 WebP, 手机截图 1080×2340 PNG, 小图标 128×128 PNG, 宽屏截图 1920×1080 JPG,
A4 证书 2480×3508 PNG, 方图 3000×3000 JPG, 极窄长图 300×3000 PNG. Folders: 收款码, 价目表, 产品图, 物流单据
(some images left in 未分类).

## Plan

1. Worker A (Opus, medium — storage): store changes + unit tests.
2. Coordinator: merge, then Worker B (Sonnet, high): sidebar/folder UI in `app/page.tsx` + `app/image-section.tsx`
   (+ a small `app/image-folders.tsx` if useful), mini-window select, e2e tests, screenshots of the extreme sizes.
3. Coordinator: preview with version switch (Windows / Mac) and the ten test images, built from this branch.
4. One PR (`major`; touches storage → `needs-owner`).
