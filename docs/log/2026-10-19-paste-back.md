# 复制后贴到刚才的窗口

- Date: 2026-10-19 · Thread/agent: 【功能】複製後直接貼回聊天窗
- What changed: new setting 「复制后贴到刚才的窗口」 (设置 → 窗口, off by default, D-081). When on, a copy in the mini
  window brings the window the person came from back to the front and presses paste once: Windows through a
  foreground-window hook plus `SendInput` Ctrl+V, Mac through System Events (`osascript`) with ⌘V. New
  `src-tauri/src/paste_back.rs`, `set_paste_back` command, `setPasteBack` on the bridge; `app/page.tsx` (settings
  state next to 迷你窗口复制后) and `app/settings.tsx` (one row in 窗口).
- User-visible change (plain Chinese, for the preview changelog): 设置 → 窗口 新增「复制后贴到刚才的窗口」开关（默认关）：开了以后，在迷你窗口点复制，会自动回到刚才的聊天窗口并替你粘贴一次；Mac 第一次要允许「辅助功能」
- Not done / risks: not tried on real Windows / Mac; 微信、钉钉、千牛 each need one real try, a few apps may ignore a
  synthetic paste. A minimized chat window is brought forward but stays minimized, so nothing pastes. Mac: if 辅助功能
  is refused, the copy still works and the settings pane opens once.
- Next step: try it on Krix's Windows PC and a Mac with 微信; then decide whether the hide setting should default to
  收起 when paste-back is on.
