# Brand files: refined app icon and new wordmark

- Date: 2026-10-13 · Thread/agent: 【品牌】logo 与文字标
- What changed: New `docs/brand/` with the app icon as SVG (the existing lock icon, lightly refined: lock recentred, keyhole bar widened for 16 px, squircle grey matched to the UI ink), a new wordmark「Clipboxx」(Inter Display SemiBold, last x in the icon's violet), 「Clipboxx 复制盒」, horizontal and stacked lockups, each in light/dark and a mono wordmark; all text as outlines. `src-tauri/icons/icon.png`, `icon.ico`, `icon.icns` re-exported from the SVG (same sizes and ICNS slots as before). Generators in `tools/brand/` (build-logo.py, export-icons.py), fonts not committed.
- User-visible change: 应用图标微调（锁居中、锁孔更清楚）；新增 Clipboxx 文字 logo 文件
- Not done / risks: The wordmark is not yet used inside the app (settings header still shows plain text). ICNS written by our own script, not `tauri icon`; verify the Dock icon on a Mac build. Icon palette (lavender/violet) still differs from the UI accent (terracotta) — left as is on purpose; a decision if the owner wants them unified.
- Next step: Decide whether the settings header「Clipboxx 复制盒」should use `wordmark-cn.svg`; check the Mac Dock icon after the next build.
