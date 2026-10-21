# 话术 list back at the top after 账号, and no stall

- Date: 2026-10-21 · Thread/agent: 修復 · 切回話術跳到底部
- What changed: Switching 账号 → 话术 (or any section / folder) no longer scrolls the list to the card that was left
  open: the effect that keeps the selected row in view skips the first run after the list changes (`app/page.tsx`,
  `scrolledList`). The list now draws its first 30 rows at once and the rest in a React transition right after
  (`listRows`, `FIRST_SCREEN_ROWS`); with 142 话术 on a 4× slowed CPU the click-to-paint time went from ~850 ms to
  ~260 ms. The saved-toast 编辑 and Mac 其他 open wait until their row is drawn. Same code on Windows and Mac.
- User-visible change (plain Chinese, for the preview changelog): 从账号（或别的板块、目录）切回话术，列表停在最上面，不再跳到底部；切换更快不卡顿
- Not done / risks: Not checked on a real Windows PC; while the rest of a long list is still being drawn (a fraction of
  a second) a row further down is not there yet.
- Next step: 无
