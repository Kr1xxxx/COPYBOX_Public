# Brand files: app icon redrawn from the owner's original, COPYBOXX wordmark

- Date: 2026-10-13 · Thread/agent: 【品牌】logo 与文字标
- What changed: New `docs/brand/` with the app icon as SVG, traced from the owner's 1024 px original (dark gradient squircle, white sideways U — the C of COPYBOXX / an open box — with a tilted purple card in its mouth; the lock icon that shipped since the Electron days was a placeholder; the squircle's outside is transparent, no cream tile), a new wordmark「COPYBOXX」(Inter Display SemiBold caps, last X in violet), 「COPYBOXX 复制盒」, horizontal and stacked lockups, each light/dark plus a mono wordmark, all text as outlines; README and preview.png. `src-tauri/icons/icon.png`, `icon.ico`, `icon.icns` re-exported from the SVG (same sizes and ICNS slots as before). Generators in `tools/brand/` (build-logo.py, export-icons.py); fonts not committed.
- User-visible change: 应用图标换成老板的 C 形图标（矢量优化版）；新增 COPYBOXX 文字 logo 文件
- Not done / risks: The wordmark says COPYBOXX while the product name in the app, window title and tray is still Clipboxx (D-044) — renaming the product is a separate decision. The wordmark is not yet used inside the app. ICNS is written by our own script, not `tauri icon`; check the Dock icon on a Mac build.
- Next step: Owner decides whether the product name follows the logo (Clipboxx → COPYBOXX); then use `wordmark-cn.svg` in the settings header.
