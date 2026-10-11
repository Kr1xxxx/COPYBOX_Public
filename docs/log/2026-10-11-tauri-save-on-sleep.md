# Tauri: save pending edits on sleep, lock screen and shutdown (Windows)

- Date: 2026-10-11 · Thread/agent: 【工程】Tauri 迁移
- What changed: Windows hook (`src-tauri/src/power.rs`) asks the page to save when the computer goes to sleep, the screen locks, or Windows starts shutting down. Adds the `windows` crate as a Windows-only dependency (already in the lock file through Tauri, so no new download). Cross-compiled with `cargo check --target x86_64-pc-windows-gnu`; the message-matching rule has a unit test.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: never run on a real Windows machine. Shutdown only gets the request, the app cannot wait for the answer, so the worst case is losing the last second of edits (the page saves 1 s after each edit anyway). macOS has no hook yet (secondary platform).
- Next step: Lock tries sleep, lock and shutdown on Windows (checklist item 10).
