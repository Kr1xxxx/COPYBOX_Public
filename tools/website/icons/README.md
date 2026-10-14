# Website icons

Committed files that `tools/website/build.mjs` copies to the site root. Regenerate them by hand when the app icon
or the share card changes, then commit the result:

```bash
node tools/website/make-icons.mjs
```

| File | Size | Made from |
| --- | --- | --- |
| `favicon.svg` | 928×928 viewBox | a copy of the brand icon `docs/brand/icon-mark.svg` (dark tile, white C, tilted purple card); also the header and footer logo. Pages link it as `/favicon.svg?v=2` (and `favicon.ico?v=2`, `apple-touch-icon.png?v=2`) so browsers drop a cached old icon; bump the number when the icon changes |
| `favicon.ico` | 16, 32, 48 | `favicon.svg`, rasterized in Chromium (PNG entries in an ICO container) |
| `apple-touch-icon.png` | 180 | `src-tauri/icons/icon.png`, scaled down in Chromium |
| `icon-192.png`, `icon-512.png` | 192, 512 | `src-tauri/icons/icon.png` (used by `site.webmanifest`) |
| `og-image.png` | 1200×630 | `tools/website/og-image.html` (brand lockup `docs/brand/lockup-horizontal.svg`), screenshot at device scale 1 (share card) |
| `wordmark-cn.svg`, `wordmark.svg` | tight viewBox | copies of `docs/brand/wordmark-cn.svg` / `wordmark.svg` cropped to the letters; the header and footer paint them through a CSS mask in the text colour (Latin only below 370 px) |

The ICO is drawn from the brand SVG, so the browser tab shows exactly the app icon (the brand README tested it down to 16 px). The share card uses the brand lockup `docs/brand/lockup-horizontal.svg` and whatever Chinese font the machine has for the headline (on Windows Microsoft YaHei, on a Mac PingFang SC); check the PNG after regenerating.

The app screenshots in `../images/` come from `node tools/website/make-screenshots.mjs` (after `npm run build &&
npm run preview:build`).
