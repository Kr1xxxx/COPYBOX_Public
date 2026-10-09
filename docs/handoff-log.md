# Session log

Newest first. One entry per session: date — who (person or agent) — what was done, what is unfinished, next step.
When this file passes 200 lines, move older entries to `docs/handoff-log-archive.md`.

- 2026-10-08 — Claude — Task 6, piece 4: moved `SettingsFolders` to `app/settings-folders.tsx`; `PLAIN_NOTES`/`SECRET_WORD` to `app/platform.ts`; `MiniHidePolicy`/`ThemeChoice`/`CloseBehavior`/`TRASH_DAY_OPTIONS` to `app/preferences.ts`. Source-text tests that look at "the UI" now read all UI files via `tests/helpers/ui-source.mjs` (assertions unchanged). Next: the settings dialog itself.
- 2026-10-08 — Claude — Task 6, piece 3: moved `SnippetFillPanel` to `app/fill-panel.tsx` and `DeleteConfirmDialog` to `app/dialogs.tsx` (unchanged; `inline-ui` test reads the new files). Also fixed a wrong type-import path in `dialogs.tsx` (`SnippetImportPreview` is exported by `snippet-import`, not `clipbox-core`) — found with a TypeScript check, harmless at runtime.
- 2026-10-08 — Claude — Task 6, piece 2: moved `useDialogKeyboard`, `SnippetImportDialog` and `BackupDialog` out of `page.tsx` into `app/dialogs.tsx` (unchanged; the 备注/秘密 word is now a prop). `inline-ui` test reads the new file with the same assertion.
- 2026-10-08 — Claude — Owner: backups stay local files, no cloud/email upload (D-016).
- 2026-10-08 — Claude — Owner: "no encryption for now, remove it". Removed the device-key protection of PR #7 (D-015 supersedes D-012); task 4 cancelled. Code is restorable from git history.
- 2026-10-08 — Claude — Owner confirmed: PR #1 (new UI) merged into `main`; PR #7 retargeted to `main`. Owner waived real-device testing (D-014); tasks 1-2 cancelled, 3 done.
- 2026-10-08 — Claude — Task 4 (owner approved): Windows device key now lives in an OS-encrypted file (`desktop/device-key.cjs`, `app/device-key-guard.ts`), old vaults migrate and are re-encrypted; D-012, D-013 (no signing). Tested with fake key store, unit tests and simulated e2e; not on real Windows. PRs #5 and #6 merged into `ui-redesign-h`; merging PR #1 into `main` is waiting for the owner's explicit 合并.
- 2026-10-09 — Claude — Task 6, piece 1: moved the AI request code and the AI settings panel out of `page.tsx` into `app/ai-client.ts` and `app/ai-settings.tsx` (code moved unchanged; the two settings tests now read the new files with the same assertions). `page.tsx` ~2500 → ~2270 lines.
- 2026-10-09 — Claude — Task 7: Windows close option "缩到任务栏" (minimise instead of hide, so the taskbar button stays); a minimised window is restored by tray/second launch/Dock. Verified in unit + simulated e2e only; needs a Windows check. Next: task 6 (split page.tsx).
- 2026-10-08 — Claude — Synced PR #1 (`ui-redesign-h`) with `main` after PR #2; no conflicts, tests green. PR #1
  waits for Windows testing and the owner's 合并.
- 2026-10-08 — Claude — Owner said 合并: merged PR #2 (handoff docs + merge policy) into `main`. Rule kept: one
  change per PR, no batching. Next: PR #1 after Windows testing.
- 2026-10-08 — Claude — Owner raised the automatic-merge limit to 350 lines of app code (D-011).
- 2026-10-08 — Claude — Checked the merge policy with a real small PR (this log entry): CI merged it by itself.
- 2026-10-08 — Claude — Merge policy (D-011): `scripts/classify-pr.mjs` + CI job `merge policy` merge small PRs
  automatically and label big ones `needs-owner`; labels created in the repository. GitHub's own branch protection
  and auto-merge need GitHub Pro for a private repository, so the policy lives in CI. Next: owner says 合并 for PR #2.
- 2026-10-09 — Claude — Reworked the handoff process from common practice (AGENTS.md conventions, Anthropic's
  guidance for long-running agents, ADRs): startup routine and three-tier boundaries in AGENTS.md, numbered
  decision records, task board, `docs/features.json` verification list, 9 browser e2e tests in `tests/e2e/`,
  CI e2e and handoff check, stale plans moved to `docs/archive/`, all docs in English. The docs also go to `main`
  on their own (branch `docs/handoff`). Not done: real-device verification. Next: owner merges the docs PR, tests
  on Windows, merges PR #1.
- 2026-10-08 — Claude — New UI "H" finished, PR #1 opened: switch/collapse animation, folder editing and drag-sort
  in Settings, plain-text 备注 on Windows, 小提示 field, user-configured AI endpoint (presets + fetch models),
  Mac/Windows fixes, all keyboard shortcuts removed, first handoff docs and CI.
