# 收起 button in the list header

- Date: 2026-10-12 · Thread/agent: 【話術】
- What changed: Lock asked (10-11, clarified 10-12 with a screenshot) for a 收起 button in the 「全部话术」 header row, just left of 选择. It folds the currently open 话术 card (`cardsCollapsed` state in `app/page.tsx`, closing animation reused); it is hidden when no card is open, in 回收站, in bulk-select mode and in the mini window. Opening any card, changing folder, kind or search brings the normal behaviour back. The 常用值 收起 inside a card is untouched. New e2e `tests/e2e/collapse-cards.e2e.mjs` (Windows and Mac).
- User-visible change: 话术列表顶部「选择」左边加了「收起」按钮,点一下收起当前展开的话术。
- Not done / risks: Only one card is ever open at a time, so the button folds that one. Not tried on a real device.
- Next step: Lock tries it in the web trial.
