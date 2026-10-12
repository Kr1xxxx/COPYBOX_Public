# Windows smoke test on GitHub

- Date: 2026-10-12 · Thread/agent: 【工程】Tauri 迁移
- What changed: Added a workflow `windows-smoke.yml` and a script `tests/windows-smoke/smoke.mjs` that build the Windows installer, install it silently on a GitHub Windows machine, start the real app, check that its window appears, kill it hard and start it again. Made-up data only (`tests/windows-smoke/smoke-snippets.csv`). It runs by hand, or when Tauri code or the test itself changes. No app code was changed.
- User-visible change (plain Chinese, for the preview changelog): 无
- Checks: silent install, window appears, data folder written, hard kill then start again, uninstall entry. The page steps (import 3 snippets, copy to the real clipboard, restart keeps data) are written but only run with SMOKE_UI=1, which needs a test-only debugging port that is not in the app yet (waiting for Lock). Screenshots, logs and a result table are uploaded as the artifact `windows-smoke-results`.
- Not done / risks: Drag and drop, the feel of right-click menus and real TinyPNG compression cannot be judged on a build machine; Lock still tries those by hand.
- Next step: Lock decides whether to merge (not merged without his word).
