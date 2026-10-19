### D-081 A mini-window copy can paste itself into the window the person came from (2026-10-19)
- Context (desktop audit item A, owner, 2026-10-19: 「A 可以?电脑版有这个权限?」). Staff copy a reply in the mini window,
  then still have to click back into WeChat / 千牛 and paste. 客服宝 and 聊天宝 sell this as 「一键发送」.
- Decision (both Windows and Mac):
  - Setting 「复制后贴到刚才的窗口」 under 设置 → 窗口, **off by default** (`clipbox.paste-back` in the browser store).
    When on and the copy happens in the **mini window**, the desktop shell brings the window that was in front before
    back to the front and presses paste once (Ctrl+V / ⌘V) for the person. The full window never does this. The
    「迷你窗口复制后」 hide setting stays separate and still applies.
  - Windows: a foreground hook (`SetWinEventHook`, own process skipped) keeps the last window in front; the taskbar and
    desktop never count. The paste is one `SendInput` Ctrl+V.
  - Mac: System Events (`osascript`) names the frontmost app when the mini window opens from the tray and whenever the
    window loses focus (the Finder never counts), and later activates it and sends ⌘V. The first use shows the
    system's own permission question; without 「辅助功能」 the paste fails quietly (the copy still happened) and the
    Accessibility pane opens once per run so the person can allow Copyboxx.
  - Same text, same window: only once (owner, 2026-10-19 「同话术只能一遍,不切窗口的情况下」). The shell remembers what it
    last pasted where; the same text to the same window again only brings the window forward. A different text into the
    window that already got one starts on its own line (「自动换一行」): a line break is put in front of it on the
    clipboard, so a manual paste right after also carries that line break. Pictures always paste as they are.
  - It is the program pressing one key for the person, not a shortcut for the person: D-005 (no keyboard shortcuts)
    is untouched. No window is ever read, only activated.
- Not verified on real Windows / Mac yet; some chat apps may block synthetic paste (`src-tauri/src/paste_back.rs`).
