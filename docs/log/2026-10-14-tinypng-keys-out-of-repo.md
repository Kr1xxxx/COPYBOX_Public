# TinyPNG keys out of the public repo

- Date: 2026-10-14 · Thread/agent: 图片压缩 · 删除公开仓库里的 TinyPNG 密钥
- What changed: the two hard-coded TinyPNG keys are gone from `app/image-compress.ts`. Built-in keys now come from the repo secret `CLIPBOX_TINIFY_KEYS`, compiled into the Rust shell (`src-tauri/src/tinify.rs`, `tinify_builtin_count`) and asked for by the page as `builtin:N`; own keys in 设置 come first. With no key at all nothing is sent and the toast says to add one (D-037 amendment).
- User-visible change (plain Chinese, for the preview changelog): 压缩密钥不再写在公开代码里；没有可用密钥时，新图片直接保存原图并提示去设置里填写压缩密钥
- Not done / risks: the owner must add the `CLIPBOX_TINIFY_KEYS` secret and revoke the old keys at tinypng.com; until then installers built by CI carry no built-in key (users need their own key in 设置). Keys in an installer can still be extracted; a Worker proxy would hide them fully.
- Next step: owner adds the secret, then a new test build.
