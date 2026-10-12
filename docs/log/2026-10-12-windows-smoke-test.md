# Windows smoke test on GitHub

- Date: 2026-10-12 · Thread/agent: 【工程】Tauri 迁移
- What changed: Added a workflow `windows-smoke.yml` and a script `tests/windows-smoke/smoke.mjs` that build the Windows installer, install it silently on a GitHub Windows machine, start the real app, check that its window appears, kill it hard and start it again. Made-up data only (`tests/windows-smoke/smoke-snippets.csv`). It runs by hand, or when Tauri code or the test itself changes. The app gets one test-only hook: with the cargo feature `test-hooks` (used only by this workflow, off in every normal and tauri-test build) and the environment variable `CLIPBOX_TEST_DEBUG_PORT`, the main window opens a local debugging port so the test can click through the page (Lock agreed 2026-10-12).
- User-visible change (plain Chinese, for the preview changelog): 无
- Checks: silent install, window appears, data folder written, hard kill then start again, then through the page: import 3 snippets, copy to the real clipboard, restart from inside the app keeps the data, hard kill keeps the data, uninstall entry. Screenshots, logs and a result table are uploaded as the artifact `windows-smoke-results`.
- Not done / risks: Drag and drop, the feel of right-click menus and real TinyPNG compression cannot be judged on a build machine; Lock still tries those by hand.
- Next step: Lock decides whether to merge (not merged without his word).
