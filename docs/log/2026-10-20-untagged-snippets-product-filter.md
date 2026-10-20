# 自己写的话术在产品筛选下不再消失

- Date: 2026-10-20 · Thread/agent: 修復 · 全部產品篩選藏起自寫話術
- What changed: `matchesSnippetProduct` (`app/snippet-import.ts`) now lets 话术 with no product groups through any
  product filter (D-101). Unit test in `tests/snippet-import.test.mjs` updated to the new rule.
- User-visible change (plain Chinese, for the preview changelog): 筛选某个产品时，自己写的（没标产品的）话术也会显示，不再整批不见
- Not done / risks: no product picker in the editor. New e2e test in `tests/e2e/main-flows.e2e.mjs` (ran only that file).
- Next step: 无
