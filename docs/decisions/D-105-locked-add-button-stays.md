### D-105 While the 账号 page is locked, 新增 stays but cannot be pressed (2026-10-20)
- Context: when the 账号 page was locked (password screen or the slide-to-open veil) the 新增 button was removed, so
  the search bar at the top grew wider than when the page was open. Krix 2026-10-20: 「上锁界面和非上锁界面的顶部搜索栏
  大小不同那个,改成一样的 / 保留新建按钮,但是上锁情况下按不了新建」.
- Decision: the 新增 button stays in the toolbar while locked or veiled, disabled. The search bar keeps the same width.
  Disabled primary buttons now look like other disabled buttons (opacity .45, no hover colour).
- Unchanged: the 回收站 view still has no 新增; the search box is still not usable behind the password screen.
