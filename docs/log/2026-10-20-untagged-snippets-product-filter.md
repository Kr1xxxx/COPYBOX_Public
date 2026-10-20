# 话术列表加「公司 / 我的」筛选，没标产品的话术不再被产品筛选藏起

- Date: 2026-10-20 · Thread/agent: 修復 · 全部產品篩選藏起自寫話術
- What changed: `matchesSnippetProduct` lets 话术 with no product through any product filter; new
  `matchesSnippetSource` and two toggle buttons 公司 / 我的 left of 选择 in `app/page.tsx` (list header) (D-101).
  Unit tests in `tests/snippet-import.test.mjs`, browser test in `tests/e2e/main-flows.e2e.mjs`.
- User-visible change (plain Chinese, for the preview changelog): 话术列表「选择」左边新增「公司 / 我的」筛选；筛选某个产品时，自己加的没标产品的话术也会显示
- Not done / risks: mini window has no 公司 / 我的; whole e2e suite not run (ran main-flows, ui-behaviour, layout-guard, list-ui-behaviour).
- Next step: 无
