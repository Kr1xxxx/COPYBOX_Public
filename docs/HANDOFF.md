# Handoff board

> The single "where are we now". Update it before you stop working; the session log lives in
> `docs/handoff-log.md`. Keep this file under 100 lines.

## Status (2026-10-09)

- Repository: https://github.com/Kr1xxxx/Clipbox
- `main` has the new UI ("H") since PR #1 was merged on the owner's word. Start from `main`.
- Checks on `main`: lint passes, `npm test`, `npm run test:e2e` (browser end-to-end) all green.
- Decisions: `docs/DECISIONS.md`. Verification status: `docs/features.json` — verified in a browser only. The owner
  waived real-device testing (D-014), so Windows/Mac stay `false` there until someone actually walks through the steps.

Merging (D-011): small PRs merge themselves when CI is green; big ones are labelled `needs-owner` and wait for the
owner to write 合并.

## Task board

States: Todo / In progress / Done / Blocked / Cancelled. Only one task "In progress" at a time.

| # | Task | State | Owner | Notes |
| --- | --- | --- | --- | --- |
| 1 | Windows: build the installer, walk through tray, launch at login, AI key per `docs/features.json` | Cancelled | Owner | Owner waived real-device testing (D-014) |
| 2 | Mac (Apple silicon): build and open, check title bar and 秘密 | Cancelled | Owner | Owner waived real-device testing (D-014) |
| 3 | Merge PR #1 | Done | Claude | Merged 2026-10-08 on the owner's 确认 |
| 4 | Protect the vault's device key with OS encryption | Cancelled | Owner | Built in PR #7, then removed on the owner's decision (D-015). Can be restored from git history |
| 5 | Backup/export for the 备注/秘密 section | Done | Claude | Settings → 导出备注备份 (秘密 on Mac): own encrypted local file, separate from snippets (D-016); imported with 导入备份. PR #15, merged on the owner's approval (replaced an old macOS test that forbade the button) |
| 6 | Split `app/page.tsx` into component files | In progress | Claude | One piece at a time, tests green after each. Done: AI client (`app/ai-client.ts`), AI settings panel (`app/ai-settings.tsx`), backup, spreadsheet-import and delete-confirm dialogs (`app/dialogs.tsx`), fill-in-variables panel (`app/fill-panel.tsx`). folder management in Settings (`app/settings-folders.tsx`; shared bits in `app/platform.ts` and `app/preferences.ts`). settings dialog (`app/settings.tsx`). item editor (`app/item-editor.tsx`). `page.tsx` row in AGENTS.md updated (PR waits for the owner's 合并). Optional next: move the `window.clipboxDesktop` type out of `page.tsx`. Source-text tests read all UI files through `tests/helpers/ui-source.mjs` |
| 7 | Alternative to the tray: Windows setting "缩到任务栏" keeps the taskbar button; Dock click already reopens on Mac | Done | Claude | No shortcuts (D-005) |

## Waiting on the owner

- How the company's shared snippet library reaches every employee (today each person imports a spreadsheet).
- AI: which provider, who pays for the key, whether snippets may contain customer data.

## Known risks

- The product is mainly for Windows but has never run on a real Windows machine (testing waived, D-014); the first real use is the real test, so keep the encrypted snippet backup. The vault and its key are stored together (D-015).
- Many unit tests assert on source text and break on refactors; `tests/e2e/` is the reference for behaviour.
