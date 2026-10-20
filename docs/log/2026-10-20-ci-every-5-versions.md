# CI every 5th version

- Date: 2026-10-20 · Thread/agent: CI 统计 · 攒几个版本一起跑
- What changed: CI, the Tauri build and the Windows smoke test no longer run on pull requests. On main they run
  only when `tools/preview/VERSION` is a multiple of 0.05 (2.40, 2.45, …; `scripts/ci-due.mjs`, unit-tested), or by
  hand from the Actions page. The handoff check and merge policy jobs are kept but no longer run. Owner's request:
  「5 个版本跑一次」.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: two merges landing together can skip a multiple of 5 (2.39 → 2.41); start that round by hand.
  Between rounds a broken change is caught only by the local lint, typecheck and unit tests.
- Next step: 无
