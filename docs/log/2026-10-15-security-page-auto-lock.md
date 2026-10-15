# Settings 安全 page and 账号 auto-lock

- Date: 2026-10-15 · Thread/agent: 功能 · 安全分页與自動上鎖
- What changed: 设置 has a new 安全 group (after 数据) holding 账号页密码, 打开账号页先滑动解锁 and 始终允许的程序, moved from
  数据. New 「账号页自动上锁」 there: 10 / 20 (default) / 30 秒 / 不上锁; after that long without activity the opened 账号
  page goes back to its password screen or slide frost. 不上锁 asks first in a 删除确认-style card (D-070).
  app/page.tsx: only the 账号 lock block near the slide-unlock state and the SettingsDialog props.
- User-visible change (plain Chinese, for the preview changelog): 设置里新增「安全」分页，账号页密码、滑动解锁和始终允许的程序都放到这里；新增账号页自动上锁，解锁后 20 秒没有操作就重新上锁，可改成 10 秒、30 秒或不上锁（选不上锁会先确认）
- Not done / risks: Not tried on a real Windows or Mac yet. Typing in a 账号 text field holds the lock off.
- Next step: 无
