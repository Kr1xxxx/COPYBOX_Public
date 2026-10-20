# CI round no longer skipped when the version jumps

- Date: 2026-10-20 · Thread/agent: CI · 跳号也自动跑检查
- What changed: `scripts/ci-due.mjs` now compares VERSION with the previous main commit and runs CI, the Tauri build
  and the Windows smoke test whenever a 0.05 step was crossed (2.39 → 2.41 now runs). D-090; unit-tested.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: if the previous commit cannot be fetched the old exact-multiple rule applies.
- Next step: 无
