# Own compression keys: remove the built-in key path

- Date: 2026-10-15 · Thread/agent: 圖片壓縮 · 個人密鑰後續
- What changed: Removed the built-in TinyPNG key path everywhere (tauri.yml secret + gate + `allow_missing_tinify_keys`
  input, Rust `tinify_builtin_count`, bridge `compressBuiltInCount`, page rotation of `builtin:N`), per D-055. 设置 →
  数据 → 图片压缩 shows the key row directly (no 高级 fold) with 「填写…」 when empty and a hint to get a free key. The no-key
  toast says 「填写你自己的压缩密钥」. Privacy page says pictures go to TinyPNG only when the person filled a key.
  `docs/DECISIONS.md` gets a linked index of D-025…D-055 and D-015 is marked superseded by D-053; HANDOFF updated.
- User-visible change (plain Chinese, for the preview changelog): 设置 → 数据 → 图片压缩 直接显示密钥一栏，不再收在「高级」里；没填时按钮是「填写…」，并提示每个人去 TinyPNG 官网免费申请自己的密钥 / 没填密钥时添加图片，提示改成「请先在 设置 → 数据 → 图片压缩 填写你自己的压缩密钥」
- Not done / risks: the privacy page change goes live only after the website thread redeploys. A tauri.yml dispatch that
  still passes `allow_missing_tinify_keys` will be rejected as an unknown input; drop that input.
- Next step: 无
