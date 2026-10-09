# Spec: 图片 section (copy images)

Owner request (2026-10-09): "单独复制图片的功能 … 把备注直接改成复制图片". Owner answers:
- Windows: the 备注 section is replaced by 图片. There are no 备注 entries to keep.
- macOS: 秘密 stays; 图片 is added as a third section.

Recorded as D-017 (supersedes the Windows half of D-003).

## What the user sees

- Section switch: Windows `话术 | 图片`; macOS `话术 | 秘密 | 图片`. Mini window too.
- 图片 list: one row per image — small thumbnail, title, 复制 button. Selecting a row shows the image larger
  (fit inside the content panel) with 复制, 改名, 删除.
- Copy puts the image itself on the clipboard (PNG), so it pastes into chat apps. Same "已复制" feedback and
  mini-window hide policy as text copy (`didCopy()`).
- Add: a 新增图片 button opens a file chooser (png, jpg, webp, gif). Dropping image files on the panel and pasting
  an image into the panel also add it (ordinary input; nothing advertises a key combination — D-005).
- Title defaults to the file name without extension (pasted images: 图片 + date/time); editable, max 40 characters.
- Search box filters images by title. Sorting: newest first.
- 删除 asks for confirmation and deletes for good (no trash in v1).
- One image at most 10 MB; larger files are refused with a short Chinese message.
- Empty state: 还没有图片，先添加第一张 / 把常发的图片存进来，一键复制。

Not in v1: folders, trash, favourites, image backup/export. Images are NOT in the snippet or 秘密 backups.

## Storage (does not touch the vault)

- The vault (`clipbox.vault.v1`) and its format are unchanged. Images live in IndexedDB database
  `clipbox-images` (version 1), stores `meta` and `blobs`, key = image id.
- Every record is AES-GCM encrypted with a key derived (PBKDF2-SHA-256, 310 000 iterations, like the vault) from the
  same device key, with a random salt kept in IndexedDB (`settings` record in `meta`, unencrypted). The key is
  derived once per session.
- `meta` record: `{ id, iv, ciphertext }` of JSON `{ id, title, type, size, width, height, createdAt, updatedAt, lastUsedAt? }`.
- `blobs` record: `{ id, iv, ciphertext }` of the original image bytes.
- Module `app/image-store.ts`:
  `openImageStore(deviceKey: string): Promise<ImageStore>` with
  `list(): Promise<ImageMeta[]>`, `add(file: Blob, title: string): Promise<ImageMeta>`,
  `rename(id, title): Promise<ImageMeta>`, `remove(id): Promise<void>`, `getBlob(id): Promise<Blob>`,
  `markUsed(id): Promise<void>`; plus `toPngBytes(blob: Blob): Promise<Uint8Array>` and pure validators
  (`IMAGE_MAX_BYTES`, `IMAGE_TYPES`, `normalizeImageTitle`).

## Copying

- Desktop: `window.clipboxDesktop.copyImage(png: Uint8Array): Promise<void>` → IPC `clipbox:copy-image` →
  trusted-sender check (`isTrustedClipboardRequest`), size cap, `nativeImage.createFromBuffer`, refuse empty
  images, `clipboard.writeImage`. Never cleared later (D-006).
- Browser: `navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])`.

## Removed on Windows

- The 备注 section, its empty state, 导出备注备份 in Settings. (`PLAIN_NOTES` code paths for display stay harmless.)
- Windows-only 备注 tests are converted to macOS 秘密 where the behaviour still exists there (backup export of 秘密),
  otherwise removed with the feature.

## Plan (coordinator + workers)

1. Worker A (Opus, medium — storage/encryption): `app/image-store.ts` + unit tests.
2. Worker B (Sonnet, medium — in parallel): desktop `copyImage` IPC + bridge type + unit tests.
3. Coordinator merges A + B, then Worker C (Sonnet, high — the biggest UI piece): section switch, image list and
   viewer, add/drag/paste, copy, Windows without 备注, e2e tests.
4. Coordinator reviews, fixes, runs everything, one PR labelled `major` (`desktop/` → `needs-owner`).
