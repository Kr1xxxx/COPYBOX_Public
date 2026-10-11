### D-037 Pictures are compressed with TinyPNG, at most 100 a month (2026-10-11)
- Context (owner, 2026-10-11: "图片上传以后都要经过 tinypng 压缩 … 每个账户每个月最多允许上传一百张图片", with a free TinyPNG API key he
  supplied and said leaking it does not matter). D-016 said data never leaves the device; this is the first time a picture is sent
  out, so it is recorded here.
- Decision (owner): every PNG, JPG and WebP added to 图片 on the desktop app is sent to the TinyPNG API (`api.tinify.com`, from the
  Rust shell, `src-tauri/src/tinify.rs`) and the smaller picture is what gets encrypted and stored. GIFs are stored as they are.
  - The key is built in as the default (the repo is public, so it is visible there: accepted by the owner) and can be replaced in
    设置 → 数据 → 图片压缩 (kept in this computer's local storage, not encrypted).
  - "Account" = this installation. The count is kept per calendar month on this computer (`clipbox.tinify.usage.v1`, one new
    storage key; nothing existing changes). At 100, adding a picture is refused with a clear message until the 1st of next month.
    Only successful compressions count.
  - If compression fails (offline, key or service error) the original is stored and the user is told. A result that is not smaller
    is dropped and the original kept.
  - Pictures already stored are not changed. The browser trial has no TinyPNG access, so there compression is simulated by
    re-encoding.
- Consequences: picture bytes (not names or any text) go to TinyPNG when a picture is added; nothing else is sent. Because the
  count is local, a reinstall or cleared data resets it; the real limit is TinyPNG's own monthly allowance on the key.
  Rollback = revert the PR; stored pictures are ordinary pictures.
- Status: Accepted.
