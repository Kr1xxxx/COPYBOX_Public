# TinyPNG: two built-in keys take turns

- Date: 2026-10-12 · Thread/agent: 【圖片】TinyPNG 双 key 轮换
- What changed: `app/image-compress.ts` now has two built-in TinyPNG keys that take turns, one per compression. A key refused with a key or limit error is retried once on the other key and skipped until the next calendar month (new storage key `clipbox.tinify.rotation.v1`). A key set in 设置 is still the only key used. The 100-a-month cap is unchanged. Tests in `tests/image-compress.test.mjs`; D-037 has a note.
- User-visible change (plain Chinese, for the preview changelog): 图片压缩现在有两个内置密钥轮流使用，一个额度用完或失效时自动换另一个；网页试用版只是模拟压缩，无变化。
- Not done / risks: the Rust command is unchanged; no real TinyPNG call was made from here. The rotation record is local to each computer.
- Next step: owner tries one real picture on the latest tauri-test build.
