# Tauri step 6: old data move

- Date: 2026-10-10 · Thread/agent: 【工程】Tauri 迁移
- What changed: new `app/data-transfer.ts` (collect, seal, open, apply) and `app/data-move.tsx` (dialog); 设置→数据 on desktop gets "导出到新版" and "从旧版导入". One password-protected file carries the vault, device key, images, thumbnails, 验证码 and settings from the Electron app to the Tauri app. Decision D-032.
- User-visible change (plain Chinese, for the preview changelog): 无（只在桌面版设置里出现）
- Tests: `tests/data-transfer.test.mjs` (7: binary round trip, wrong password, tampered file, foreign keys refused before writing, full round trip with images) and `tests/e2e/data-move.e2e.mjs` (export, wipe, import back 34 snippets, wrong password message).
- Not done / risks: only tried in Chromium with sample data, not between a real Electron profile and a real Tauri/WebView2 profile; Lock must try it once on Windows. Writes the vault last, but a crash between the databases and the settings would leave new images beside the old vault (re-import fixes it). A debounced vault write still pending in the page right before import could be lost, so import reloads at once. Very large image libraries are held in memory while exporting (images are capped at 10 MB each).
- Next step: step 7 (packaging, parity list, real-Windows check).
