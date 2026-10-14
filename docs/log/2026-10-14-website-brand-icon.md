# Website icons are the exact brand icon, with cache-busting

- Date: 2026-10-14 · Thread/agent: 網站 · Cloudflare 與 copyboxx.com
- What changed: `tools/website/icons/favicon.svg` is now a copy of `docs/brand/icon-mark.svg` (it was a simplified hand-drawn variant), `favicon.ico` regenerated from it; header, footer and `<head>` link the icons with `?v=2` so browsers drop a cached old favicon.
- User-visible change (plain Chinese, for the preview changelog): 无（只改了官网：浏览器标签和页眉的图标换成和 App 一样的新图标）
- Not done / risks: 无
- Next step: 无
