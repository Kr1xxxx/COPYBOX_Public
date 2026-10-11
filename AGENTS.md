# Clipbox — instructions for agents and developers

Read this first. Claude reads it through `CLAUDE.md`; Codex reads it directly.
Details live in `docs/`; this file only holds what you need every time.

## Project

A local, encrypted copy box: it stores "snippets" (话术 — canned customer-service replies) and a second section
(秘密 "secrets", macOS only) and 图片 (images, both platforms; D-017). One click copies an entry.
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
| `app/page.tsx` | Main UI: state, list, mini window; ~1580 lines, search before editing. Parts live next to it: `item-editor.tsx`, `fill-panel.tsx`, `settings.tsx`, `settings-folders.tsx`, `ai-settings.tsx`, `dialogs.tsx` |
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

- `window.clipboxDesktop.platform === "darwin"` → 秘密 (masked content, copy reference, split segments);
  any other platform (`PLAIN_NOTES`) → no second text section; sections are 话术 | 图片.
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
- Push to `main`, or merge a PR labelled `needs-owner` before the owner says so (see "Merging").
- Commit real customer data, API keys or `.env` files — use `docs/samples/`.
- Delete or loosen a test just to make it pass — find out whether the code or the test is wrong, and say so in the PR.
- Rename `saveItem`, `submit`, `openVault` and similar — `tests/helpers/page-harness.mjs` extracts them by name.
- Add keyboard shortcuts or "auto-clear clipboard" — the owner explicitly rejected both (D-005, D-006).

## When you finish

1. Add **one new file** `docs/log/YYYY-MM-DD-short-name.md` (template: `docs/log/README.md`). Do not edit
   `docs/HANDOFF.md`, `docs/handoff-log.md` or the table in `docs/DECISIONS.md` (see "Parallel PRs").
2. A new decision is a new file `docs/decisions/D-NNN-short-name.md`; update `docs/features.json` for what you verified.
3. Commit in small steps, push your branch, open a PR using the template. CI fails if `app/`, `src-tauri/` or
   `package.json` changed but no new `docs/log/` note with a `- What changed:` line was added.
4. Report to the owner **in Chinese**, in four parts: 做了什么 (what was done) / 没做好的地方 (what is not done well)
   / 需要你做的 (what the owner needs to do) / 建议下一步 (recommended next step). Finish everything that can be
   finished instead of leaving it as a caveat.

## Parallel PRs (several agents at once)

Files that every PR used to edit made parallel PRs conflict. The rule now: **a PR only adds new files for its notes.**

- `tools/preview/VERSION` and `tools/preview/changelog.json` belong to the preview publisher (the 【話術】 thread)
  alone. Feature PRs never bump the version or edit the changelog; write the "User-visible change" line in your
  `docs/log/` note and the publisher turns it into a changelog entry. CI fails a PR that edits these files unless it
  carries the label `preview-publisher` (only the publisher adds it; GitHub cannot stop another agent from adding it, so this is an agreed rule, not a lock).
- Handoff notes: one new file per PR in `docs/log/`. Decisions: one new file per decision in `docs/decisions/`.
  `docs/HANDOFF.md`, `docs/handoff-log.md` and the `docs/DECISIONS.md` table are not edited by feature PRs.
- `docs/HANDOFF.md` (status) and `docs/ROADMAP.md` are updated only by the coordinator.
- Before opening a PR run `git fetch origin main && git rebase origin/main`; if you touch `app/page.tsx`, say which
  part in the PR so others can avoid it.

## Merging (D-011)

The owner never uses the GitHub website; all work goes through agents. CI decides how each PR merges:

- **Small** — merges by itself once every check is green: wording, styling, bug fixes, tests and docs, with at most
  350 changed lines in `app/` (tests and docs do not count there) and under 500 changed lines in total.
- **Big** — CI labels it `needs-owner` and stops: anything under `src-tauri/`, dependencies, CI and scripts, the
  rulebook (`AGENTS.md`, `CONTRIBUTING.md`, `docs/DECISIONS.md`), data storage or encryption, deleted app files,
  weakened tests, more than 350 lines of app code, or 500+ changed lines in total (any file type).
- New or removed features and layout changes cannot be detected from files: **add the `major` label yourself** when
  you open such a PR (`gh pr edit <n> --add-label major`), right away, before CI finishes.
- A `needs-owner` PR is merged only after the owner writes 合并 (merge) in the conversation about that PR. Then merge
  it with `gh api -X PUT repos/Kr1xxxx/Clipbox/pulls/<n>/merge -f merge_method=merge -f sha=<head sha>` (the commit
  whose checks are green) and log it.
- Tell the owner in Chinese which PRs merged by themselves and which are waiting.

Keep this file under 150 lines. Add a rule only after an agent repeats the same mistake; delete stale rules.
