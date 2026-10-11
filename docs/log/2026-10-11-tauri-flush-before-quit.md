# Tauri: save pending edits before quit or restart

- Date: 2026-10-11 · Thread/agent: 【工程】Tauri 迁移
- What changed: main had a new page-to-shell pair (`onFlushRequest` / `flushDone`) that the Tauri bridge lacked, so `npm test` failed on main after #77. Added both to the bridge and a `flush.rs` in Rust: quit, tray "退出" and restart first ask the page to save, wait at most 1.5 s, then exit.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: Electron also saves on sleep, lock screen and shutdown; Tauri has no power-event hook yet, so those three are not covered. Not run on real Windows or Mac.
- Next step: add the power events (Windows/Mac native hooks) before step 8; put it on the Windows checklist.
