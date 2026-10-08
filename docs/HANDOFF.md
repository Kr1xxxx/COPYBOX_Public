# Handoff board

> The single "where are we now". Update it before you stop working; the session log lives in
> `docs/handoff-log.md`. Keep this file under 100 lines.

## Status (2026-10-09)

- Repository: https://github.com/Kr1xxxx/Clipbox
- **`main` still has the old UI.** The new UI ("H") is on branch `ui-redesign-h`, PR #1, waiting for the owner
  to test on Windows. Start UI work from `ui-redesign-h` until PR #1 is merged; `npm run test:e2e`, `app/ai-config.ts`
  and `tests/e2e/` only exist there.
- On `ui-redesign-h` (synced with `main` 2026-10-08): lint passes, `npm test` 176/176, `npm run test:e2e` 9/9.
- Decisions: `docs/DECISIONS.md`. Verification status: `docs/features.json` — only verified in a browser so far;
  nothing verified on real Windows or Mac hardware.

Merging (D-011): small PRs merge themselves when CI is green; big ones are labelled `needs-owner` and wait for the
owner to write 合并. PR #2 (handoff docs + merge policy) is merged; PR #1 (new UI) is big and waits.

## Task board

States: Todo / In progress / Done / Blocked / Cancelled. Only one task "In progress" at a time.

| # | Task | State | Owner | Notes |
| --- | --- | --- | --- | --- |
| 1 | Windows: build the installer, walk through tray, launch at login, AI key per `docs/features.json` | Todo | Owner | Needs a Windows PC |
| 2 | Mac (Apple silicon): build and open, check title bar and 秘密 | Todo | Owner | Needs a Mac |
| 3 | Merge PR #1 | Blocked | Owner | Waiting on 1 and 2 |
| 4 | Protect the vault's device key with OS encryption (today it sits next to the data, so a copied data folder can be decrypted) | Todo | — | Changes storage — ask the owner first |
| 5 | Backup/export for the 备注/秘密 section | Todo | — | |
| 6 | Split `app/page.tsx` into component files | In progress | Claude | One piece at a time, tests green after each. Done: AI client (`app/ai-client.ts`) and AI settings panel (`app/ai-settings.tsx`). Next: backup/import dialogs, settings dialog, item editor. Update the `page.tsx` row in AGENTS.md when the split is finished |
| 7 | If opening from the tray feels awkward: show the window when the taskbar/Dock icon is clicked | Todo | — | No shortcuts (D-005) |

## Waiting on the owner

- How the company's shared snippet library reaches every employee (today each person imports a spreadsheet).
- AI: which provider, who pays for the key, whether snippets may contain customer data.
- Code signing and auto-update for the installers (costs money).

## Known risks

- The product is mainly for Windows but has never run on a real Windows machine.
- Many unit tests assert on source text and break on refactors; `tests/e2e/` is the reference for behaviour.
