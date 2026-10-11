# Tauri step 3: tray, close behaviour, launch at login

- Date: 2026-10-10 · Thread/agent: 【工程】Tauri 迁移
- What changed: the Tauri shell now has the tray (快速搜索 / 打开 Clipbox / 退出, left click toggles), the close-button setting (tray, taskbar on Windows, quit), one running copy only, launch at login (quiet start with `--hidden`), opening the data folder, the Mac Dock click, the focus-search signal, and hiding the mini window after a copy by the saved setting (`src-tauri/src/shell.rs`, new plugins: autostart, single-instance, opener). Rules are unit-tested.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: only the close-to-hide behaviour was run (Linux window); the tray, single instance and launch at login need a real Windows / Mac (no tray or desktop bus in the test box). The data folder is Tauri's own folder, not Electron's. 【工程】代码整理 is adding tray-only startup to the Electron app; this shell already honours `--hidden`.
- Next step: step 4 (AI key, AI requests, update reminder, restart).
