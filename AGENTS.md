# Clipbox — instructions for agents and developers

Read this first. Claude reads it through `CLAUDE.md`; Codex reads it directly.
Details live in `docs/`; this file only holds what you need every time.

## Project

A local, encrypted copy box: it stores "snippets" (话术 — canned customer-service replies) and a second section
(账号 "accounts": logins, payments, API keys, codes; both platforms, D-038) and 图片 (images, both platforms; D-017). One click copies an entry.
**Windows first**; macOS ships Apple-silicon (arm64) only. The UI is entirely in Chinese. Data stays on the
device: no server, no accounts.

Stack: Tauri 2 (`src-tauri/`, Rust; D-029) + React 19 + vinext 1.0 beta (Next-style framework on Vite, `app/`)
+ hand-written CSS (`app/globals.css`) + TypeScript, Node ≥ 22.18.

## Before you start (every session)

1. Read `docs/HANDOFF.md` (status, task board) and `git log --oneline -20`.
2. Read `docs/DECISIONS.md`; make sure the task does not contradict a decision.
3. Run `npm test` and `npm run test:e2e` so you know the starting point is green. If it is not, fix that first
   or record it in the handoff.
4. Mark your task "In progress" on the task board. Work on one task at a time.

## Commands

```bash
npm install
npm run dev              # browser dev server, http://localhost:3000
npm run lint             # must pass
npm run typecheck        # TypeScript check of app/ (tsconfig.typecheck.json); must pass
npm test                 # build + unit/source tests (tests/*.test.mjs)
npm run test:e2e         # build + browser end-to-end tests (tests/e2e/, Playwright, 680×620 window)
npm run tauri:dev        # run the desktop app locally (needs Rust)
npm run tauri:build      # installer: NSIS on Windows, .app on a Mac → src-tauri/target/release/bundle/
```

## Structure

| Path | What it is |
| --- | --- |
| `app/page.tsx` | Main UI: state, list, mini window; ~2120 lines, search before editing. Parts live next to it: `item-editor.tsx`, `fill-panel.tsx`, `settings.tsx`, `settings-folders.tsx`, `ai-settings.tsx`, `dialogs.tsx` |
| `app/clipbox-core.ts` | Pure functions (folders, search, bulk actions, `tidyText`); put new logic here, with unit tests |
| `app/ai-config.ts` | User-configured AI endpoint: presets, validation, request/response parsing |
| `app/globals.css` | All styles; platform differences via `.platform-darwin` / `.desktop-app:not(.platform-darwin)` |
| `src-tauri/src/main.rs` | Rust shell: windows, tray, launch at login, commands the page may call |
| `src-tauri/bridge.js` | The `window.clipboxDesktop` bridge — the only way the page reaches the OS |
| `src-tauri/src/ai.rs` | Stores the AI key in the OS credential store |
| `tools/clipbox-cli.cjs` | The `clipbox` command line (macOS/Linux), installed by the app |
| `tests/*.test.mjs` | node:test; some still assert on source text — prefer testing behaviour (pure functions, `tests/e2e/`) |
| `tests/e2e/` | Browser end-to-end tests; `helpers.mjs` seeds sample data and fakes Windows/macOS |
| `docs/features.json` | Feature verification list (verified in browser / on Windows / on Mac) |
| `docs/samples/` | Mock snippet spreadsheet — the only data to test with |
| `docs/archive/` | Old plans. **Out of date — do not follow them.** |

## Platform differences

- Sections are 话术 | 图片 | 账号 on both platforms (order set by the owner, 2026-10-13). Only macOS (`window.clipboxDesktop.platform === "darwin"`) still has the old
  秘密 list (masked content, copy reference, split segments) inside 账号; elsewhere `PLAIN_NOTES` hides it (no 其他, no 目录).
- 账号 can have a password that also encrypts its data with a random key, with a recovery code (`app/account-lock.ts`,
  `app/account-encryption.ts`, keys `clipbox.account-lock.v1` / `clipbox.account-premigration.v1`, D-038, D-040).
- 图片 (`app/image-section.tsx`, `app/image-store.ts`) is not an `ItemKind`: images live in their own encrypted IndexedDB
  store, never in the vault.
- macOS: hidden title bar with traffic lights. Windows: native frame, tray, silent launch at login (`--hidden`).
- The command-line automation server only starts on macOS/Linux.

## Boundaries

**Always**
- Pass `npm run lint`, `npm run typecheck` and `npm test` before committing; after UI changes also run `npm run test:e2e` and look at
  the page yourself.
- Add tests with every feature; put user-visible behaviour in `tests/e2e/`.
- Write user-visible text in short, plain Chinese without technical terms.
- In `docs/features.json`, set a platform to `true` only after you actually walked through the steps there.

**Ask the owner first**
- Changing or reversing anything in `docs/DECISIONS.md`.
- Adding a dependency, or changing the encryption format or storage keys (`clipbox.vault.v1`, …) — a mistake
  locks users out of their data, so it needs a migration and tests.
- Releasing a version.

**Never**
- Push to `main`, or merge a high-risk PR before the owner writes 合并 (see "Merging").
- Commit real customer data, API keys or `.env` files — use `docs/samples/`.
- Delete or loosen a test just to make it pass — find out whether the code or the test is wrong, and say so in the PR.
- Rename `saveItem`, `submit`, `openVault` and similar — `tests/helpers/page-harness.mjs` extracts them by name.
- Add keyboard shortcuts or "auto-clear clipboard" — the owner explicitly rejected both (D-005, D-006).

## When you finish

1. Add **one new file** `docs/log/YYYY-MM-DD-short-name.md` (template: `docs/log/README.md`). Do not edit
   `docs/HANDOFF.md`, `docs/handoff-log.md` or the table in `docs/DECISIONS.md` (see "Parallel PRs").
2. A new decision is a new file `docs/decisions/D-NNN-short-name.md`; update `docs/features.json` for what you verified.
3. Commit in small steps, push your branch, open a PR using the template. Add a new `docs/log/` note with a
   `- What changed:` line whenever `app/`, `src-tauri/` or `package.json` changed (CI no longer checks this, see below).
4. Report to the owner **in Chinese**, in four parts: 做了什么 (what was done) / 没做好的地方 (what is not done well)
   / 需要你做的 (what the owner needs to do) / 建议下一步 (recommended next step). Finish everything that can be
   finished instead of leaving it as a caveat.

## Parallel PRs (several agents at once)

Files that every PR used to edit made parallel PRs conflict. The rule now: **a PR only adds new files for its notes.**

- `tools/preview/VERSION` and `tools/preview/changelog.json` belong to the preview publisher (the main Claude session)
  alone. Feature PRs never bump the version or edit the changelog; write the "User-visible change" line in your
  `docs/log/` note and the publisher turns it into a changelog entry.
- Handoff notes: one new file per PR in `docs/log/`. Decisions: one new file per decision in `docs/decisions/`.
  `docs/HANDOFF.md`, `docs/handoff-log.md` and the `docs/DECISIONS.md` table are not edited by feature PRs.
- `docs/HANDOFF.md` (status) and `docs/ROADMAP.md` are updated only by the coordinator.
- Before opening a PR run `git fetch origin main && git rebase origin/main`; if you touch `app/page.tsx`, say which
  part in the PR so others can avoid it.

## Merging (D-041, replaces the waiting rule of D-011)

The owner never uses the GitHub website; all work goes through agents.

- Open PRs without asking. When every check on the latest commit is green and there is no conflict, merge it yourself
  (`gh api -X PUT repos/Kr1xxxx/Clipbox/pulls/<n>/merge -f merge_method=merge -f sha=<head sha>`), whatever its size
  or files (`src-tauri/`, `package.json`, CI and this file included). The `needs-owner` label from CI is not a stop.
- Wait for the owner to write 合并 only for **high-risk** PRs: anything that could lose, corrupt or lock user data
  (storage or encryption format, storage keys, migrations, the save / restore / key path, deleting user data),
  releasing to staff, or anything irreversible. Ask in plain Chinese and say what the risk is.
- If permissions block a merge, say it is a permission block and ask the owner to reply 「合并 N」; never work around it.
- Never skip, disable or loosen a test, or change the CI gates, to get green.
- Before merging, run `/ponytail-review` on your diff and fix what it finds.
- CI does not run on PRs (owner, 2026-10-20): on main it runs when VERSION reaches or jumps past a 0.05 step (2.40, 2.45, …, D-090,
  `scripts/ci-due.mjs`); run lint, typecheck and unit tests locally before every merge, and start CI by hand when needed.
- New or removed features and layout changes: add the `major` label yourself when you open the PR.
- Tell the owner in Chinese which PRs merged and which wait for him.

Keep this file under 150 lines. Add a rule only after an agent repeats the same mistake; delete stale rules.
