### D-079 Windows mini window sticks to the screen edge; the Mac window has a size limit and no full screen (2026-10-19)
- Context (owner, 2026-10-19, answering item B of the desktop audit): 「只做 Windows, 再把 mac 改成无法全屏, 最大限定一个尺寸,
  不会拖到窗口边上后自适应变大(我们的软件不需要那么大) 反而经常会在窗口最边上等待复制」.
- Decision, Windows (`src-tauri/src/window_mode.rs`, `window_state.rs`):
  - 设置 → 窗口 → 「迷你窗口贴边收起」, on by default (owner: 「Windows 开关默认开」), Windows only
    (`clipbox.mini-edge-snap`, sent to the shell on start).
  - With it on, a mini window let go within 24 px of a screen's left or right edge sticks to that edge. Half a second after
    the mouse leaves the window it folds away off the edge, leaving a 16 px strip drawn as a notch-like rounded tab,
    288 px long, with "copyboxx" written along it (owner: 「收起来后做一个刘海类似的效果」, 「加上英文 copyboxx, 这个条改成长度三倍」;
    the shell tells the page the edge, `clipbox:mini-fold`); the mouse touching the tab, or the window getting the focus
    (tray 快速搜索), slides it back out. Folding and unfolding glide over about 150 ms (owner: 「弹出做动效」). An edge
    shared with a second screen never counts.
  - Switching to the full window, or turning the setting off, brings a folded window back out. The remembered mini
    position is the stuck one, never the folded one.
  - The earlier 「迷你窗口复制后」 setting (hide after a copy) is gone: the mini window never hides after a copy
    (owner: 「迷你窗口复制后, 这个收起功能删掉, 保证不收起」).
- Decision, launch at login (`src-tauri/src/shell.rs`, owner: 「开机自启动 … 加一个检测的功能, 防止被其他软件关闭」):
  the person's own choice for 开机自动启动 is kept in a small file `launch-at-login` in the app's data folder. At every
  start and once an hour the app checks the system's entry; when the choice is on and the entry was removed or switched
  off (by a cleaner, a security tool or Task Manager), it is put back. Someone who had it on before this version is
  taken over as "on" at the first start. 点击窗口关闭按钮时 stays 收到托盘 by default (unchanged).
- Decision, macOS (`src-tauri/src/main.rs`, `window_mode.rs`):
  - The full window is never larger than 1000×800 (minimum stays 680×620); a saved larger size opens at the limit.
  - The green button is off (no zoom, no full screen) and the View menu with 进入全屏 is gone, so the window cannot
    fill the screen or be tiled larger than the limit. The mini window is unchanged (360×440, on top).
- Not done: following another program's window (too heavy, audit B). Needs a real Windows and a real Mac to verify
  (`docs/features.json` mini-edge-snap, mac-size-limit).
