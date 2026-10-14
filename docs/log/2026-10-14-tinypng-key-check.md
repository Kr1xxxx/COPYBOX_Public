# Tauri build says whether TinyPNG keys went in

- Date: 2026-10-14 · Thread/agent: 图片压缩 · 删除公开仓库里的 TinyPNG 密钥
- What changed: `.github/workflows/tauri.yml` gets a "TinyPNG keys" step: it writes the number of keys from `CLIPBOX_TINIFY_KEYS` to the job summary (never the keys), warns when the secret is empty, and fails a published test build without keys.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: 无
- Next step: 无
