# Tauri: drag the window by its top band

- Date: 2026-10-12 · Thread/agent: 【工程】Tauri 迁移
- What changed: The old shell moved the window with a CSS drag region, which Tauri ignores. The bridge now starts a window drag on mouse-down inside `.drag-region` (not on buttons or inputs), and on a Mac a double-click zooms. The window capability allows start dragging and toggle maximize.
- User-visible change (plain Chinese, for the preview changelog): 无(网页测试版里没有这个问题,只影响桌面版)
- Not done / risks: Only the wiring is tested; dragging on real Windows and Mac hardware is not yet tried.
- Next step: Lock tries the new test build.
