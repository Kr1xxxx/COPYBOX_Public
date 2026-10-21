# 选择 button no longer disappears

- Date: 2026-10-20 · Thread/agent: 【功能】主窗口筛选后「选择」消失
- What changed: In the 话术 and 图片 header, 选择 now stays in place (greyed out) when the filter (公司 / 我的 / product / search) leaves nothing, or while an editor is open, instead of being removed and shifting 全部产品. It is shown exactly when the filters are shown; the 账号 header already behaved this way. `tests/e2e/main-flows.e2e.mjs` checks that the positions do not move.
- User-visible change (plain Chinese, for the preview changelog): 点「公司」后「选择」不再消失，按钮位置不再跳动
- Not done / risks: 无。Touches only the header buttons in `app/page.tsx` (section-head, ~line 2553 and 2561).
- Next step: 无
