# Website icons

Committed files that `tools/website/build.mjs` copies to the site root. Regenerate them by hand when the app icon
or the share card changes, then commit the result:

```bash
node tools/website/make-icons.mjs
```

| File | Size | Made from |
| --- | --- | --- |
| `favicon.svg` | 64×64 viewBox | drawn by hand (dark rounded square, lavender lock, purple keyhole); also the header logo |
| `favicon.ico` | 16, 32, 48 | `favicon.svg`, rasterized in Chromium (PNG entries in an ICO container) |
| `apple-touch-icon.png` | 180 | `src-tauri/icons/icon.png`, scaled down in Chromium |
| `icon-192.png`, `icon-512.png` | 192, 512 | `src-tauri/icons/icon.png` (used by `site.webmanifest`) |
| `og-image.png` | 1200×630 | `tools/website/og-image.html`, screenshot at device scale 1 (share card) |

The ICO is drawn from the SVG rather than the app icon: the app icon has a light margin and a thin lock that turn
into a grey blob at 16 px, while the SVG's lines sit on the pixel grid. The share card uses whatever Chinese font the
machine has (on Windows Microsoft YaHei, on a Mac PingFang SC); check the PNG after regenerating.

The app screenshots in `../images/` come from `node tools/website/make-screenshots.mjs` (after `npm run build &&
npm run preview:build`).
