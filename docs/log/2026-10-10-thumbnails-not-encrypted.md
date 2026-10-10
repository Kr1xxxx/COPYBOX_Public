# 图片 thumbnails stored unencrypted

- Date: 2026-10-10 · Thread/agent: 【圖片】宮格與動效
- What changed: thumbnails are stored as plain bytes in `clipbox-image-thumbs` (owner decision, D-025); originals and `clipbox-images` stay encrypted and untouched. Old encrypted thumbnail rows are ignored and replaced when the thumbnail is made again. Tests cover plain storage and the old-row case; an e2e test caught a bug where the bytes were read inside the IndexedDB transaction, now fixed.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: thumbnails are readable on disk without the key (intended). Old encrypted thumbnails stay on disk, unused, until replaced or the image is deleted.
- Next step: motion step 4 (rename, search, drop zone, empty states, counters).
