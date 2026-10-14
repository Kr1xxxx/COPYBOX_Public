# The mini window no longer hides itself after a copy

- Date: 2026-10-13 · Thread/agent: coordinator
- What changed: the default of 设置 → 窗口 → 「迷你窗口复制后」 is now 「不收起」 (page default in app/page.tsx and the shell default in src-tauri/src/shell.rs). Before, a mini window opened from the Windows tray hid 1.2 s after every copy. A choice someone already made is kept. New e2e check in tests/e2e/platforms.e2e.mjs.
- User-visible change (plain Chinese, for the preview changelog): 迷你窗口复制后不再自动收起（设置 → 窗口 里仍可改回「从托盘呼出时收起」）
- Not done / risks: not tried in a real Windows build; the shell receives the page's choice on start as before.
- Next step: 无
