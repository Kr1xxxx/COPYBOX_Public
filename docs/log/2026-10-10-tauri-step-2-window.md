# Tauri step 2: window behaviour

- Date: 2026-10-10 · Thread/agent: 【工程】Tauri 迁移
- What changed: the Tauri shell now remembers the window size and position (same rules as `desktop/window-state.cjs`, ported to `src-tauri/src/window_state.rs` with unit tests), has the mini window (fixed 360×440, always on top, keeps the top-right corner or its own remembered spot, back to the full window on request), the theme setting, the 30-second idle quieting, and shows the window only after the page has painted. CI now also runs `cargo test`.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: checked on Linux WebKit with a window manager (size, mini, back to full, position file); Windows and Mac only by CI build. The Mac traffic-light position cannot be changed at runtime in Tauri, so the mini window keeps the full-window position (Electron moved it up by 5 px). Theme switching is wired but only checked by build. Hiding after a copy, the tray and "start hidden" are step 3.
- Next step: step 3 (tray, close behaviour, single instance, launch at login, data folder).
