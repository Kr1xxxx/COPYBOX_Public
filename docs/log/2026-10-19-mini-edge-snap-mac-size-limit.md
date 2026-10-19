# Mini window sticks to the screen edge (Windows); Mac window size limit, no full screen

- Date: 2026-10-19 · Thread/agent: 【窗口】迷你窗貼邊與 Mac 尺寸上限
- What changed: D-079. Windows: new 设置 → 窗口 → 「迷你窗口贴边收起」 switch (on by default); with it on, the mini window
  sticks to the screen's left or right edge, folds away to a 16 px notch-like tab when the mouse leaves and slides out
  when the mouse touches it or the window gets the focus (`window_mode.rs` settle/fold, `window_state.rs` `mini_dock`,
  tab drawn by `globals.css` from the `clipbox:mini-fold` event). macOS: the
  full window is capped at 1000×800, the green button is off and the View menu (进入全屏) is removed (`main.rs`).
- User-visible change (plain Chinese, for the preview changelog): Windows 设置 → 窗口 新增「迷你窗口贴边收起」（默认开）：迷你窗口拖到屏幕左右边缘会吸住，鼠标离开只留一个刘海式的小标签，碰一下滑出来；Mac 完整窗口最大 1000×800，不再进全屏，拖到屏幕边上也不会自动变大
- Not done / risks: window behaviour cannot show in the web preview (only the switch and the note under 设置 → 窗口).
  Nothing verified on a real Windows or Mac yet; macOS Sequoia's own edge tiling should now only move the window, not
  enlarge it, but that needs a look on a real Mac. On Windows with display scaling the 16 px strip may look a little
  narrower because of the window's invisible frame border.
- Next step: try on Windows (drag the mini window to the right edge, move the mouse away, touch the strip; tray 快速搜索
  while folded) and on a Mac (green button, ⌃⌘F, drag to the screen edge), then mark `docs/features.json`.
