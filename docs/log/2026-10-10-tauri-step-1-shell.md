# Tauri step 1: shell that loads the existing UI

- Date: 2026-10-10 · Thread/agent: 【工程】Tauri 迁移
- What changed: new `src-tauri/` (Tauri 2) that opens the existing UI in a window on Windows and macOS and supports copying text and images; `scripts/tauri-frontend.mjs` saves the built page as static files; CI workflow `tauri.yml` builds the installer on both platforms. Electron is untouched. See D-029.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: only copy and version work in the shell; window memory, mini window, tray, auto-start, AI key, update reminder, Mac command line and data migration are later steps. Checked in a Linux WebKit window only; Windows and Mac builds are checked by CI, not by hand.
- Next step: step 2 (window behaviour).
