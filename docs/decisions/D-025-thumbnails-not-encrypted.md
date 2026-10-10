### D-025 图片 thumbnails are stored unencrypted (2026-10-10)
- Context (owner, 2026-10-10: "图片缩略图改成加密的小图单独存,这个就不用加密了" and "合并 #62"): D-024 kept a small thumbnail per image,
  encrypted with the image key. The owner decided the thumbnails do not need encryption.
- Decision (owner): thumbnails (at most 320 px, WebP) are stored as plain bytes in their own IndexedDB database
  `clipbox-image-thumbs`. This replaces only the "encrypted" part of D-024; everything else in D-024 stands. The original images and
  their database `clipbox-images` stay encrypted and are not touched.
- Consequences: a thumbnail is readable on disk without the key. Rows written by the first (encrypted) version have no
  plain bytes, so they are ignored and replaced the next time the thumbnail is made; nothing is shown broken. Dropping the
  thumbnail database only makes thumbnails be made again. Rollback = revert the PR.
- Status: Accepted.
