# First-run guide

- Date: 2026-10-13 · Thread/agent: W14 (worker)
- What changed: New app/first-run-guide.tsx shows a four-page guide (话术, 图片, 账号, 迷你窗口和备份) once, the first time the full window opens after the data is open; never in the mini window. Closing it any way (跳过, ×, Esc, 开始使用) stores clipbox.first-run-guide.v1 = 1. 设置 → 关于 has a new row 使用说明 with 再看一遍. In app/page.tsx only the dialog-state lines next to auxiliaryDialogOpen, one render line before DeleteConfirmDialog, an import and one SettingsDialog prop changed. Tests: playwright.config.mjs starts every test with the guide already seen (storage state from tests/e2e/helpers.mjs); data-move.e2e.mjs keeps the key after its localStorage.clear(); layout-guard.e2e.mjs checks all four guide pages; new tests/e2e/first-run-guide.e2e.mjs.
- User-visible change (plain Chinese, for the preview changelog): 第一次打开时有 4 页使用说明（话术、图片、账号、迷你窗口和备份），可以跳过；设置 → 关于 → 使用说明 可以再看一遍
- Not done / risks: Existing users see it once after updating (agreed in the request). The last page describes the default close behaviour (Windows: 托盘 in the lower right; Mac: 菜单栏); someone who already changed 点击窗口关闭按钮时 reads the default. Not checked on a real Windows or Mac machine (D-014).
- Next step: 无
