# Lazy save (1 second) and quiet start without a window

- Date: 2026-10-10 · Thread/agent: 【工程】 (advisor 輕量化 items 1 and 2)
- What changed: (1) Small, frequent changes — copy counts / last used, pins, card and folder order — now update the
  screen at once but are written to disk one second after the last change (`app/lazy-writer.ts`, `persistLazy` in
  `app/page.tsx`). Real edits (save, delete, move, import, restore, settings) still save immediately, and an immediate save
  also covers anything lazy that was waiting. Waiting changes are saved first when the window is hidden or closed
  (`pagehide`, `visibilitychange`), when the app quits or relaunches (main asks the page: `clipbox:flush` /
  `clipbox:flush-done`, `desktop/flush-request.cjs`, 1.5 s limit), on sleep / lock / shutdown (`powerMonitor`), and before
  a reload. (2) A quiet start (launch at login: `--hidden` on Windows, `wasOpenedAtLogin` on macOS) now only puts the tray
  icon up: the local server and the window are started on the first tray click, 快速搜索, Dock click, second launch, or
  the first command-line command (`ensureWindow` in `desktop/main.cjs`; the command line opens a hidden window).
- Not changed: encryption format, storage keys, the vault envelope. No data migration.
- Risk judged: low. Snippet text and everything the person edits is still written immediately. The only things that can be
  lost are the last second of usage counts, pins or order after a hard crash or power cut.
- Tests: `tests/lazy-writer.test.mjs`, `tests/flush-request.test.mjs`, bridge `ensureReady` in
  `tests/automation-bridge.test.mjs`, main-process wiring in `tests/desktop-runtime.test.mjs`, browser behaviour in
  `tests/e2e/lazy-save.e2e.mjs` (checked they fail when the hide flush or the quit flush is removed). `page-harness` also
  loads the new `storeVault` / `commitVaultToMemory` pieces by name.
- User-visible change: 复制、收藏、排序这类小操作不再每次都重写整个保险箱（停手 1 秒后再保存，退出、休眠前一定保存）；开机静默启动只放托盘图标，第一次点开才加载界面（第一次打开会慢半拍）
- Not done / risks: Electron cannot run in this environment, so the quiet start, the quit flush and sleep flush were NOT
  walked through on Windows or macOS (only unit tests, source-wiring tests and the browser tests). Needs a real check:
  start with `--hidden`, see only the tray icon, click it, quit with a pending pin, run a CLI command on a quiet start.
  On Windows there is no sleep hook for the save (only hide / quit); an OS shutdown relies on the hide flush.
