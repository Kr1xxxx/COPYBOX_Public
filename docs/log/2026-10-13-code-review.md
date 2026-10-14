# Whole-repository review (no code changes)

- Date: 2026-10-13 · Thread/agent: 【審查】整体检查 (coordinator + three read-only review workers: data layer, Rust shell, front-end)
- What changed: nothing in the app; this note records the review findings so follow-up PRs can pick items by number. The
  numbers match the Chinese list sent to the owner.
- User-visible change (plain Chinese, for the preview changelog): 无
- Baseline on `main` (805fde4) in this session: `npm run lint` ✓, `npm run typecheck` ✓, `npm test` 389/389 ✓,
  `npm run test:e2e` (Chromium) 202 passed, 1 flaky (`main-flows.e2e.mjs:492` folder drag: Settings folder names read back as
  empty strings once, passed on retry; the 2026-10-12 polling fix did not fully cure it).
- Not done / risks: findings marked "needs a Windows check" were traced in code only; nothing here was run on a real Windows PC.
- Next step: the owner picks numbers; each item below says whether it auto-merges or needs the owner (storage format,
  dependencies, rulebook).

## Problems (most severe first)

1. **Never run on a real Windows machine.** `docs/features.json`: 24 features, browser 19 verified, Windows 0, Mac 0. The only
   real-Windows evidence is the GitHub-runner smoke test (`tests/windows-smoke/`). Four findings below (2, and the three
   "needs a Windows check" items in 16) can only be settled on a real PC. Issue #33 already holds a 10-minute checklist; add
   these four points to it.

2. **Exit flush gaps.** (a) `src-tauri/src/shell.rs` `on_close_requested`: with close behaviour 退出 the close button returns
   `true`, the window is destroyed, then `ExitRequested` → `flush::then_after_flush` → `Flush::request` finds no main window
   and returns at once (`flush.rs`). Only the page's async `pagehide` flush remains, which cannot finish PBKDF2 + encrypt +
   write before the webview dies. Lost: lazy writes of the last ~1 s (copy counts, pins, order). Fix: in the `Quit` branch
   call `api.prevent_close()` and go through `Shell::quit` so the normal flush runs. (b) The flush handshake in
   `app/page.tsx` (~770-790) awaits only the vault queue + lazy writer; the three 账号 stores (`secret-items-store.ts`,
   `totp-store.ts`, `site-icon-store.ts`, each with its own `serialFor` queue) and `image-store.ts` IndexedDB writes are not
   awaited. Saving an account and quitting within ~0.5 s can lose it. Fix: one shared "pending writes" set awaited by the
   flush. (c) `power.rs` `WM_QUERYENDSESSION` starts the flush and returns immediately; Windows may end the process first.
   Needs a Windows check; possible fix `ShutdownBlockReasonCreate` released from `flush_done`. No format change. Rust → owner's
   merge per D-011 (agent-notes 2026-10-13 allows self-merge when green; data-safety related, so tell the owner).

3. **Daily auto backup grows without bound.** `app/auto-backup.ts` + `app/data-transfer.ts` `collectPayload`: every day a full
   copy of everything, images included as base64 (×1.33), kept 7 times in `app_data_dir/backups` (Roaming %APPDATA% on
   Windows). `backup.rs` `backup_save` is a synchronous command (runs on the main thread in Tauri 2) writing up to 512 MB:
   the UI freezes during the write; above 512 MB the command returns "input" and `runAutoBackup` swallows it (`"failed"`,
   result ignored at `page.tsx:1265`), so backups silently stop. Options: back up images incrementally (only new/changed blobs),
   or exclude images from the daily file and keep them in a weekly one; make `backup_save`/`backup_read`/`ai_*`/
   `open_data_folder` async commands; show "最近一份备份：N 天前" in 设置 when the latest is older than 2 days. Owner decides
   the shape (backup file format).

4. **Restore runs outside the vault write queue.** `applyPayload` is called from `app/data-move.tsx:89` and
   `app/auto-backup-ui.tsx:82`, then `window.location.reload()`. The lazy writer (`page.tsx` ~770) and any in-flight
   `storeVault` still encrypt with the old `deviceKey` from React state; `reload()` fires `pagehide` → `writer.flush()`. If a
   lazy change is pending (copy/drag within the last second) the vault is rewritten under the old key next to the new
   `clipbox.device-key.v1` → "本地数据读取失败" after reload, stash already cleared. Rare, but the outcome is a lock-out. Fix:
   run the restore inside `enqueueVaultTask` after `lazyWriter.flush()`, set a "restoring" flag that makes `storeVault` and
   the 账号 stores refuse, and keep the stash until the next successful `openVault`. Also `applyImport` (`page.tsx` ~1571,
   账号备份 v3) writes vault → TOTP → items with no rollback and skips the 账号 part while locked. No format change; auto-merges
   if < 350 app lines (touches storage words → likely `needs-owner` by `classify-pr.mjs`).

5. **账号 password edge cases.** (a) `app/account-encryption.ts` `enableAccountEncryption`: the lock record (K wrapped by password
   and recovery code, phase `migrating`) is written before `writeAll`; a crash there leaves the password active and the
   recovery code never shown; `finishAccountMigration` (`account-lock-ui.tsx:25`) completes silently on the next unlock. Fix:
   when it actually migrates, force the 新恢复码 flow. (b) `clipbox.account-premigration.v1` (device-key encrypted copy of all
   three stores) stays until someone deletes it in 设置, survives 关闭密码, and is copied into every 完整备份 and auto backup;
   with the device key beside it, it defeats D-040 for anyone holding the data folder. Fix: delete it automatically after N
   successful unlocks in phase `ready` (or after 7 days) and skip it in `collectPayload`. (b) changes a D-040 lifecycle → owner.
   (c) Enable/disable migrations are not serialised against the stores' own writers (icon scan, TOTP last-copied mark) — a
   migration lock the stores await. Not fully verified that the UI lets these overlap.

6. **Large libraries get slow (≈1,000+ snippets).** `page.tsx:1701` `canMoveCard` runs `filtered.filter` + `findIndex` per
   rendered row (O(n²) per render, every keystroke); `renderFolderRow` (`:1705`) filters all items per folder; rows are not
   memoised. `app/snippet-search.ts:15-40`: the pinyin cache (`PINYIN_CACHE_LIMIT = 4000`, up to 3 texts per snippet) is
   cleared wholesale above ~1,333 snippets, so every Latin keystroke recomputes pinyin for the whole library; `snippetFields`
   lowercases every body per keystroke. `page.tsx:410`: `legacySecrets` is a fresh `[]` on Windows on every `items` change and
   is an effect dependency of `useAccountEntries` (`account-entries.ts:73`) → both 账号 stores re-read and re-derive keys.
   `page.tsx:713`: the keydown effect re-subscribes (incl. Tauri `listen`/`unlisten`) on every keystroke. `image-section.tsx:265`:
   thumbnails decrypt all at once with one `setThumbs` per image. Fixes: memoised id→canUp/canDown and folder-count maps
   (~15 lines); `WeakMap<SecretItem, …>` cache for fields + pinyin (~15 lines, unit-testable); module-level `NO_LEGACY`;
   `onFocusSearch` in its own `[]` effect; batch thumbnail state per frame. Each auto-merges. Later: memoised `SnippetRow`.

7. **Every save derives the key again.** `page.tsx:168-199` `encryptVault` runs PBKDF2 310,000 iterations on the random 256-bit
   device key on every `storeVault`; measured 91 ms on a 2.1 GHz server core, likely 0.1–0.3 s on office laptops. The input
   is already random, so the stretching has no security value; the salt is reused (`oldSalt`), so the derived key is
   identical every time. The 账号 stores derive on every `list()`/`put()` with a fresh salt. Fix: cache the `CryptoKey` in
   memory (vault), reuse the envelope salt and cache (stores). No format change; lowering iterations would be one.

8. **Toasts.** 35 `window.setTimeout(() => setToast(""), N)` in `page.tsx` are never cancelled (only `flashToast` at `:652`
   clears its timer): a newer message is wiped by an older timer; "最近的改动保存失败" (`:770`) has no timer at all.
   `app/arc/arc-toast.tsx:38-41` always draws the ✓ path, also for failures. `emptyTrash` (`page.tsx:1365`, called as
   `void onEmptyTrash()` in `settings.tsx:172`), `applySnippetImport` (`:1611`) and `SnippetImportDialog.confirm`
   (`dialogs.tsx:47`) have no catch → unhandled rejection, user sees nothing. Four `window.alert` calls (`page.tsx:1512,
   1562, 1583, 1606`; 1512 still says 保险箱). Fix: `useToast()` with one timer ref + `tone: "ok" | "error"` prop; catch and
   show. Net negative lines; auto-merges.

9. **Rulebooks contradict each other.** `AGENTS.md` ("Never … merge a PR labelled `needs-owner` before the owner says so")
   vs `docs/agent-notes.md` (2026-10-13: "CI fully green → merge it yourself, whatever the size or files"); `CLAUDE.md` +
   `.claude/agents/worker.md` (workers = Sonnet medium) vs agent-notes (Opus 5.5 medium); `docs/HANDOFF.md` frozen at
   2026-10-09 but still presented as "the single where are we now". Fix: fold the current rules into `AGENTS.md`, point
   HANDOFF.md at agent-notes, update `worker.md`. Rulebook change → owner.

10. **Capacity ceiling.** The whole 话术 vault is one localStorage string (WebView2 quota ~5–10 MB per origin). A long bilingual
    snippet is 2–3 KB of JSON → roughly 1,500–3,000 snippets, fewer with the 账号 icon cache (`site-icon-store.ts`, ~1.78× icon
    size, up to 100 KB per icon by `site_icon.rs`). `QuotaExceededError` is caught but shown as a generic save failure. Fix now:
    detect the quota error by name and say 存储空间已满; cap icons (64 px / ~8 KB). Later, if libraries grow: move the vault to
    IndexedDB (storage change → owner).

## Improvements (not urgent)

11. **CI minutes.** One CI run ≈ 11 billed minutes (e2e 8.6 min of it); 271 runs since 2026-10-08. Tauri workflow: Windows
    ~5 min (2× billing) + macOS ~4.5 min (10× billing) on every `main` push touching `src-tauri/` and every dispatch (77 runs).
    Estimated from durations, not from the bill. Savings: path-filter the e2e job out of docs-only/preview PRs; build the
    Mac installer only on dispatch or with the `mac-check` label; cache Playwright browsers (small). `.github/` → owner.

12. **Template leftovers in `package.json`.** Unreferenced: `drizzle-orm`, `drizzle-kit` (+ `db:generate` script),
    `@cloudflare/vite-plugin`, `wrangler` (vinext's CLI no longer imports it; no wrangler config exists; `WRANGLER_LOG_PATH`
    in the scripts is also a leftover), `@tailwindcss/postcss`. `tailwindcss` is imported only for its reset: `globals.css:1`
    `@import "tailwindcss"` ships the theme variables + preflight and leaves `@tailwind utilities` unprocessed in the built
    CSS (`dist/client/_next/static/css/*.css` contains the literal directive). `node_modules` is 625 MB. Fix: remove the five,
    replace the import with `@import "tailwindcss/preflight.css"` or an inlined reset. Dependencies → owner.

13. **Stale docs.** `AGENTS.md:41` says page.tsx ~1580 lines (2115); `README.md:3-6` still describes two sections and Windows
    as 话术 | 图片 (D-038 added 账号); `docs/ROADMAP.md` lists 图片备份 (#26) and thumbnails (#29) as open although 完整备份 and
    D-024 shipped; seven Rust comments still cite deleted `desktop/*.cjs` files; `page.tsx:235-239,1642` comments say "Mac only"
    for both-platform features; `globals.css:668` shortcut comment; ~37 lines of unused CSS classes and the dark theme block
    written twice (`globals.css:609-655`). Auto-merges.

14. **Branches.** 86 remote branches, 50 already merged into `main` (owner-merged PRs do not delete their branch). Delete the
    merged ones.

15. **Brittle tests.** 22 of 48 unit test files assert on source text (`tests/helpers/ui-source.mjs`, `page-harness.mjs`
    extracts functions by name, hence the "never rename saveItem/submit/openVault" rule); 36 `waitForTimeout` calls in e2e
    (`layout-guard` 11, `image-grid` 6, `mini-tabs` 5, `main-flows` 5); `retries: 1` in CI hides flakes; the folder-drag test
    flaked again in this session (see baseline). Convert the highest-churn source-text tests to behaviour tests; replace fixed
    waits with condition waits; make the folder-drag test wait for the collapsible to finish opening.

16. **Small hardening (Rust).** `site_icon.rs` `is_private_address` misses IPv4-compatible `::a.b.c.d`, NAT64 `64:ff9b::/96`,
    6to4 `2002::/16`, `ff00::/8`, `fec0::/10`, and reqwest honours system proxies (add `.no_proxy()`); `shared_library.rs`
    reads chunked bodies with no cap before the 5 MB check and accepts any URL from the page (reuse `read_limited`, or restrict
    to the saved address); backup/vault/vault-box readers accept any `iterations` from a file (`data-transfer.ts:270`,
    `page.tsx:202`, `vault-backup.ts:46`; clamp to e.g. 5,000,000); `automation.rs` `install_cli` overwrites
    `~/.local/bin/clipbox` through symlinks on every macOS start and `CLIPBOX_AUTOMATION_SOCKET_PATH` lets it chmod/delete an
    arbitrary path; equal 10 s timeouts in `handle`/`forward` leak `pending` entries. Needs a Windows check: `bridge.js`
    `watchTitleDrag` runs on Windows too (`.menu-scrim` inside `header.toolbar.drag-region` → `start_dragging` on a click);
    `shell.rs` `relaunch` → `app.restart()` after a `--hidden` login start probably restarts hidden; `main.rs` 4 s fallback
    `show()` is unconditional; `window_mode.rs` mixed-DPI bounds restore. `image-store.ts:406-415`: a failed thumbnail delete
    leaves the plaintext thumb (D-025) behind — sweep orphans on open.

## Checked and fine

One write queue for the vault (UI, automation, import, folder changes); memory committed only after the write succeeds; the
single-instance plugin; the four 2026-10-13 audit fixes are complete for their scope; recovery code never stored in plain form
or in any backup; `backup.rs` names are exact (no traversal); `tinify.rs` and `ai.rs` origin checks; CSP and capability set
minimal; no `innerHTML`/`dangerouslySetInnerHTML` in `app/`; listener cleanup and `cancelled` guards throughout; reduced-motion
handled in every `app/arc/` component.
