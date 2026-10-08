# Clipbox — instructions for agents and developers

Read this first. Claude reads it through `CLAUDE.md`; Codex reads it directly.
Details live in `docs/`; this file only holds what you need every time.

## Project

A local, encrypted copy box: it stores "snippets" (话术 — canned customer-service replies) and a second section
(called 备注 "notes" on Windows, 秘密 "secrets" on macOS). One click copies an entry.
**Windows first**; macOS ships Apple-silicon (arm64) only. The UI is entirely in Chinese. Data stays on the
device: no server, no accounts.

Stack: Electron 37 (`desktop/`, CommonJS) + React 19 + vinext 1.0 beta (Next-style framework on Vite, `app/`)
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
npm test                 # build + unit/source tests (tests/*.test.mjs)
npm run test:e2e         # build + browser end-to-end tests (tests/e2e/, Playwright, 680×620 window)
npm run desktop:dev      # run the desktop app locally
npm run desktop:pack:win # Windows NSIS installer, run on Windows → release/
npm run desktop:pack     # macOS arm64 .app, run on a Mac → release/mac-arm64/
```

## Structure

| Path | What it is |
| --- | --- |
| `app/page.tsx` | Main UI (list, inline editor, fill-in variables, settings, mini window); ~2500 lines, search before editing |
| `app/clipbox-core.ts` | Pure functions (folders, search, bulk actions, `tidyText`); put new logic here, with unit tests |
| `app/ai-config.ts` | User-configured AI endpoint: presets, validation, request/response parsing |
| `app/globals.css` | All styles; platform differences via `.platform-darwin` / `.desktop-app:not(.platform-darwin)` |
| `desktop/main.cjs` | Main process: windows, tray, launch at login, IPC |
| `desktop/preload.cjs` | The `window.clipboxDesktop` bridge — the only way the page reaches the OS |
| `desktop/ai.cjs` | Stores the AI key with OS encryption (safeStorage) |
| `tests/*.test.mjs` | node:test; many are regex assertions on source text |
| `tests/e2e/` | Browser end-to-end tests; `helpers.mjs` seeds sample data and fakes Windows/macOS |
| `docs/features.json` | Feature verification list (verified in browser / on Windows / on Mac) |
| `docs/samples/` | Mock snippet spreadsheet — the only data to test with |
| `docs/archive/` | Old plans. **Out of date — do not follow them.** |

## Platform differences

- `window.clipboxDesktop.platform === "darwin"` → 秘密 (masked content, copy reference, split segments);
  any other platform → 备注, plain text (`PLAIN_NOTES`).
- macOS: hidden title bar with traffic lights. Windows: native frame, tray, silent launch at login (`--hidden`).
- The command-line automation server only starts on macOS/Linux.

## Boundaries

**Always**
- Pass `npm run lint` and `npm test` before committing; after UI changes also run `npm run test:e2e` and look at
  the page yourself.
- Add tests with every feature; put user-visible behaviour in `tests/e2e/`.
- Write user-visible text in short, plain Chinese without technical terms.
- In `docs/features.json`, set a platform to `true` only after you actually walked through the steps there.

**Ask the owner first**
- Changing or reversing anything in `docs/DECISIONS.md`.
- Adding a dependency, or changing the encryption format or storage keys (`clipbox.vault.v1`, …) — a mistake
  locks users out of their data, so it needs a migration and tests.
- Merging to `main` or releasing a version.

**Never**
- Push to `main` or merge a PR yourself — everyone shares the owner's GitHub account, so this rule is the only
  thing that keeps `main` reviewed. The owner clicks merge.
- Commit real customer data, API keys or `.env` files — use `docs/samples/`.
- Delete or loosen a test just to make it pass — find out whether the code or the test is wrong, and say so in the PR.
- Rename `saveItem`, `submit`, `openVault` and similar — `tests/helpers/page-harness.mjs` extracts them by name.
- Add keyboard shortcuts or "auto-clear clipboard" — the owner explicitly rejected both (D-005, D-006).

## When you finish

1. Update `docs/HANDOFF.md` (status, task board) and add an entry at the top of `docs/handoff-log.md`.
2. Record new decisions in `docs/DECISIONS.md`; update `docs/features.json` for what you verified.
3. Commit in small steps, push your branch, open a PR using the template. CI fails if `app/`, `desktop/` or
   `package.json` changed but `docs/HANDOFF.md` did not.
4. Report to the owner **in Chinese**, in four parts: 做了什么 (what was done) / 没做好的地方 (what is not done well)
   / 需要你做的 (what the owner needs to do) / 建议下一步 (recommended next step). Finish everything that can be
   finished instead of leaving it as a caveat.

Keep this file under 150 lines. Add a rule only after an agent repeats the same mistake; delete stale rules.
