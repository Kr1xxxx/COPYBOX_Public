# Windows smoke test on GitHub

- Date: 2026-10-12 · Thread/agent: 【工程】Tauri 迁移
- What changed: Added a workflow `windows-smoke.yml` and a script `tests/windows-smoke/smoke.mjs` that build the Windows installer, install it on a GitHub Windows machine, start the real app and drive its page through the WebView2 debugging port with Playwright. Made-up data only (`tests/windows-smoke/smoke-snippets.csv`). It runs by hand, or when Tauri code or the test itself changes. No app code was changed.
- User-visible change (plain Chinese, for the preview changelog): 无
- Checks: install, start, import 3 snippets, copy to the real clipboard, restart from inside the app keeps the data, hard kill keeps the data. Screenshots, logs and a result table are uploaded as the artifact `windows-smoke-results`.
- Not done / risks: Drag and drop, the feel of right-click menus and real TinyPNG compression cannot be judged on a build machine; Lock still tries those by hand. The test needs the debugging port, which is switched on only by an environment variable set by the test.
- Next step: Lock decides whether to merge (not merged without his word).
