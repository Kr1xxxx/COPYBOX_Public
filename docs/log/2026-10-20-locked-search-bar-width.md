# Locked 账号 page keeps the search bar width

- Date: 2026-10-20 · Thread/agent: 修復 · 上鎖時搜索欄寬度
- What changed: on the 账号 page, the 新增 button no longer disappears while the page is locked (password) or veiled
  (slide to open); it stays, disabled, so the top search bar is the same width locked and open. `.primary-button:disabled`
  now has the same faded look as other disabled buttons. D-105.
- User-visible change (plain Chinese, for the preview changelog): 账号页上锁时，顶部搜索栏和打开时一样宽；「新增」按钮还在，但变灰按不了。
- Not done / risks: also affects the other few disabled primary buttons (lock screen 打开 with an empty password, AI 保存,
  添加收款信息 at the limit): they now look faded too. Browser tests were updated but not run (light testing).
- Next step: none.
