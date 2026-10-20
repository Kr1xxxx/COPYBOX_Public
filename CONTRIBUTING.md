# Contributing

For company developers and AI agents. Read `AGENTS.md` first.

## Starting a task

1. `git checkout main && git pull`, then branch from the latest `main`: `feature/short-name` or `fix/short-name`.
2. Read `docs/HANDOFF.md` and `docs/DECISIONS.md`; make sure the task does not contradict a decision.
3. `npm install`, then run `npm test` and `npm run test:e2e` to confirm the starting point is green.
4. One branch and one PR per task. Do not edit the task board in `docs/HANDOFF.md` (frozen; parallel PRs conflict).

## Commits

- One logical change per commit, with a message that says what changed.
- Before committing: `npm run lint` and `npm test` pass; after UI changes `npm run test:e2e` passes too.
- Never commit real customer data, API keys, `.env`, `release/`, `dist/` or `.next/`.

## Pull requests

- Target `main` and fill in the template: what changed, how it was verified, what was not verified, what the
  owner needs to decide.
- CI no longer runs on pull requests (owner, 2026-10-20). On main, lint + tests, browser end-to-end tests, the
  Tauri build and the Windows smoke test run every 5th preview version (`scripts/ci-due.mjs`), or by hand. Run lint,
  typecheck and unit tests locally before merging. The handoff check and `merge policy` jobs are kept but do not run.
  Label new/removed features and layout changes `major` yourself.
- Who merges what is in AGENTS.md "Merging" (D-041): green PRs are merged by the agent, high-risk ones only after
  the owner says 合并. Never push to `main`.

## Finishing a task

- Add one new note file in `docs/log/` (see `docs/log/README.md`). Never bump `tools/preview/VERSION` or edit
  `tools/preview/changelog.json`: the preview publisher owns them (AGENTS.md, "Parallel PRs").
- For features you actually verified, set the platform to `true` in `docs/features.json`.
- Record a new product decision as a new file in `docs/decisions/`.
- Report to the owner in Chinese, in four parts: 做了什么 / 没做好的地方 / 需要你做的 / 建议下一步.

## Repository settings

- Everyone, agents included, works through the owner's GitHub account; the owner does not use the website.
- The repository is public, so GitHub Actions on GitHub-hosted runners (macOS included) cost nothing. The merge
  policy runs inside CI (`merge policy` job), and "never push to `main`" is a rule, not something GitHub enforces.
- A ruleset for `main` is possible on a public repository and not set up yet: require a pull request (0 approvals),
  require the status checks `lint + tests`, `browser end-to-end`, `handoff updated`, `merge policy`, block force
  pushes and deletions. Then nothing can reach `main` without passing CI.
