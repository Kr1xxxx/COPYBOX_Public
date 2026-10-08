# Contributing

For company developers and AI agents. Read `AGENTS.md` first.

## Starting a task

1. `git checkout main && git pull`, then branch from the latest `main`: `feature/short-name` or `fix/short-name`.
2. Read `docs/HANDOFF.md` and `docs/DECISIONS.md`; make sure the task does not contradict a decision.
3. `npm install`, then run `npm test` and `npm run test:e2e` to confirm the starting point is green.
4. Mark the task "In progress" on the board in `docs/HANDOFF.md`. One branch and one PR per task.

## Commits

- One logical change per commit, with a message that says what changed.
- Before committing: `npm run lint` and `npm test` pass; after UI changes `npm run test:e2e` passes too.
- Never commit real customer data, API keys, `.env`, `release/`, `dist/` or `.next/`.

## Pull requests

- Target `main` and fill in the template: what changed, how it was verified, what was not verified, what the
  owner needs to decide.
- CI runs three checks: lint + tests, browser end-to-end tests, and a handoff check (fails if `app/`,
  `desktop/` or `package.json` changed without an update to `docs/HANDOFF.md`). All three must be green.
- **Only the owner merges.** Do not merge your own PR and never push to `main`.

## Finishing a task

- Update `docs/HANDOFF.md` (status, task board) and add an entry at the top of `docs/handoff-log.md`.
- For features you actually verified, set the platform to `true` in `docs/features.json`.
- Record new product decisions in `docs/DECISIONS.md`.
- Report to the owner in Chinese, in four parts: 做了什么 / 没做好的地方 / 需要你做的 / 建议下一步.

## Repository settings (owner)

Everyone pushes with the owner's GitHub account, so GitHub cannot require an approval (nobody can approve their
own PR). Protect `main` like this instead — Settings → Rules → Rulesets → New branch ruleset, target `main`:

- Require a pull request before merging (required approvals: 0).
- Require status checks to pass: `lint + tests`, `browser end-to-end`, `handoff updated`.
- Block force pushes and restrict deletions.

If agents or developers later get their own accounts, raise required approvals to 1 so the owner must approve.
