# 账号 page locks by timer only

- Date: 2026-10-19 · Thread/agent: 功能 · 账号上锁规则
- What changed: Leaving the 账号 section no longer locks it; only the auto-lock timer does, and it keeps counting on other sections (D-076). While locked, the 账号 sidebar (全部 / 收藏 / 最近 / 回收站 / 分类) is disabled.
- User-visible change (plain Chinese, for the preview changelog): 切换到话术或图片再回来，账号页不会再上锁，只按设置里的时间上锁；账号页上锁时左边的目录不能点，解锁后才能切换
- Not done / risks: e2e not run (light testing until the next big version); the four touched e2e tests were updated to the new rule.
- Next step: 无
