### D-078 Windows mini window sticks to the screen edge; the Mac window has a size limit and no full screen (2026-10-19)
- Context (owner, 2026-10-19, answering item B of the desktop audit): 「只做 Windows, 再把 mac 改成无法全屏, 最大限定一个尺寸,
  不会拖到窗口边上后自适应变大(我们的软件不需要那么大) 反而经常会在窗口最边上等待复制」.
- Decision, Windows (`src-tauri/src/window_mode.rs`, `window_state.rs`):
  - 设置 → 窗口 → 「迷你窗口贴边收起」, off by default, Windows only (`clipbox.mini-edge-snap`, sent to the shell on start).
  - With it on, a mini window let go within 24 px of a screen's left or right edge sticks to that edge. Half a second after
    the mouse leaves the window it folds away off the edge, leaving a 16 px strip; the mouse touching the strip, or the
    window getting the focus (tray 快速搜索), slides it back out. An edge shared with a second screen never counts.
  - Switching to the full window, or turning the setting off, brings a folded window back out. The remembered mini
    position is the stuck one, never the folded one.
- Decision, macOS (`src-tauri/src/main.rs`, `window_mode.rs`):
  - The full window is never larger than 1000×800 (minimum stays 680×620); a saved larger size opens at the limit.
  - The green button is off (no zoom, no full screen) and the View menu with 进入全屏 is gone, so the window cannot
    fill the screen or be tiled larger than the limit. The mini window is unchanged (360×440, on top).
- Not done: following another program's window (too heavy, audit B). Needs a real Windows and a real Mac to verify
  (`docs/features.json` mini-edge-snap, mac-size-limit).
