### D-076 The 账号 page locks only by its timer; while locked its sidebar cannot switch (2026-10-19)
- Context (owner, 2026-10-19: 「切换页面不会导致上锁,还是按照时间来上锁 / 上锁后目录不能点击切换,要解锁才可以」).
- Decision (both Windows and Mac; changes part of D-051 and D-070):
  - **No lock on leaving.** Switching to 话术 or 图片 and back no longer locks the 账号 page. It locks again only by the
    「账号页自动上锁」 timer (D-070), which now keeps counting while another section is showing, and (slide frost only,
    unchanged) when the window is hidden. With 不上锁, the page stays open until the app is closed.
  - **Locked sidebar.** While the 账号页密码 screen or the slide frost shows, the 账号 sidebar buttons (全部 / 收藏 / 最近 /
    回收站 and 分类) are disabled; the mini window's tabs do nothing on the password screen. They work again once unlocked.
    The 话术 / 图片 / 账号 switch stays usable.
- Nothing in storage, encryption or the vault changes. Tests: `tests/account-auto-lock.test.mjs`,
  `tests/e2e/account-auto-lock.e2e.mjs`, `tests/e2e/account-lock.e2e.mjs`, `tests/e2e/account-slide-unlock.e2e.mjs`.
