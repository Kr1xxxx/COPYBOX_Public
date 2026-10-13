# Brand files: sideways-U app icon and COPYBOXX wordmark

- Date: 2026-10-13 · Thread/agent: 【品牌】logo 与文字标
- What changed: New `docs/brand/` with the app icon as SVG (a sideways U — the C of COPYBOXX / an open box — in the old icon's dark squircle and lavender; the owner said the icon should be a sideways U, so the lock glyph is gone), a new wordmark「COPYBOXX」(Inter Display SemiBold caps, last X in violet), 「COPYBOXX 复制盒」, horizontal and stacked lockups, each light/dark plus a mono wordmark, all text as outlines; README and preview.png. `src-tauri/icons/icon.png`, `icon.ico`, `icon.icns` re-exported from the SVG (same sizes and ICNS slots as before). Generators in `tools/brand/` (build-logo.py, export-icons.py); fonts not committed.
- User-visible change: 应用图标换成侧着的 U；新增 COPYBOXX 文字 logo 文件
- Not done / risks: The wordmark says COPYBOXX while the product name in the app, window title and tray is still Clipboxx (D-044) — renaming the product is a separate decision. The wordmark is not yet used inside the app. ICNS is written by our own script, not `tauri icon`; check the Dock icon on a Mac build.
- Next step: Owner decides whether the product name follows the logo (Clipboxx → COPYBOXX); then use `wordmark-cn.svg` in the settings header.
