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
  - Two built-in keys take turns, one per compression (2026-10-12, owner). If a key is refused (key error or monthly limit) the
    same picture is retried once on the other key and the refused key is skipped until next month (`clipbox.tinify.rotation.v1`,
    one new storage key; nothing existing changes). Network and service errors do not retry or mark a key. A key set in 设置 is
    the only key used. The 100-a-month cap per installation is unchanged.
  - Two own keys (2026-10-14, owner: "压缩密钥可以设置两个"). 设置 → 数据 → 图片压缩 takes a 第一个密钥 and an optional 第二个密钥
    (`clipbox.tinify.key.v1` as before, new `clipbox.tinify.key2.v1`). Own keys do not take turns: the first is used until it is
    refused (key error or monthly limit), then the same picture is retried on the second, which stays in use until the month
    changes (`clipbox.tinify.custom.v1`, one new storage key; nothing existing changes). Saving a changed key clears its refusal.
    The row says which key is in use. Own keys never fall back to the built-in ones; with none set, the built-in keys rotate as before.
- Consequences: picture bytes (not names or any text) go to TinyPNG when a picture is added; nothing else is sent. Because the
  count is local, a reinstall or cleared data resets it; the real limit is TinyPNG's own monthly allowance on the key.
  Rollback = revert the PR; stored pictures are ordinary pictures.
- Status: Accepted.

#### Amendment 2026-10-14: no key in the repo
- Owner (2026-10-14, after the audit): 「tinypng 的密钥给我从公开仓库删掉」. The two built-in keys are removed from
  `app/image-compress.ts`; nothing in the repo holds a key any more. They stay in the public git history, so they must be
  revoked at tinypng.com and replaced with new ones.
- Built-in keys now come only from the repo secret `CLIPBOX_TINIFY_KEYS` (comma-separated), read by
  `src-tauri/src/tinify.rs` at compile time (`option_env!`) in `.github/workflows/tauri.yml`. The page never sees them:
  it asks the shell how many there are (`tinify_builtin_count`) and names them `builtin:0`, `builtin:1`, … They take
  turns as before (`clipbox.tinify.rotation.v1`). Own keys from 设置 still come first.
- With no own key and no built-in key (a build without the secret, or the browser preview), nothing is sent or counted;
  the picture is stored as it is and the toast says 「未压缩：请先在 设置 → 数据 → 图片压缩 填写压缩密钥」.
- Limitation: a key built into the installer can still be dug out of it. Fully hiding it needs a proxy (e.g. a
  Cloudflare Worker) that holds the key; not done here.
