# CI: browser tests split over four machines

- Date: 2026-10-15 · Thread/agent: 查詢 · CI 為什麼變慢
- What changed: The e2e suite grew from 230 to 322 tests and ran on one machine with 2 workers, so CI took about 11 minutes per push. `.github/workflows/ci.yml` now runs it as four Playwright shards in parallel (every test still runs once; retries stay 0) with a `browser end-to-end` job that is green only when all four pass. A new push to the same PR cancels the older run of that PR; runs on main are never cancelled.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: `layout-guard.e2e.mjs` alone takes about 4 minutes (8 tests, ~28 s each) and sets the floor for one shard.
- Next step: If CI needs to get faster still, look at why layout-guard tests take ~28 s each.
