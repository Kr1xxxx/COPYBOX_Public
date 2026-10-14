# Two own TinyPNG keys

- Date: 2026-10-14 · Thread/agent: 图片压缩 · 两个 TinyPNG 密钥
- What changed: 设置 → 数据 → 图片压缩 now takes two own keys (`app/image-compress-settings.tsx`); `app/image-compress.ts` uses the first until TinyPNG refuses it (wrong key or quota), then switches to the second for the rest of the month (D-037 amended). Unit tests in `tests/image-compress.test.mjs`, e2e in `tests/e2e/images.e2e.mjs`.
- User-visible change (plain Chinese, for the preview changelog): 图片压缩可以填两个密钥，第一个用完后自动换第二个，设置里会显示正在用哪一个
- Not done / risks: 没在真实 Windows/Mac 应用里用真的 TinyPNG 密钥试过（浏览器测试版没有压缩服务）。
- Next step: 无
