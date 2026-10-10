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
- CI runs three checks: lint + tests, browser end-to-end tests, and a handoff check (fails if `app/`,
  `desktop/` or `package.json` changed without a new note in `docs/log/`). All three must be green.
- CI also runs `merge policy` (`scripts/classify-pr.mjs`): small PRs merge themselves when everything is green;
  big ones get the `needs-owner` label and wait. Label new/removed features and layout changes `major` yourself.
- A `needs-owner` PR is merged only after the owner says 合并 in the conversation. Never push to `main`.

## Finishing a task

- Add one new note file in `docs/log/` (see `docs/log/README.md`). Never bump `tools/preview/VERSION` or edit
  `tools/preview/changelog.json`: the preview publisher owns them (AGENTS.md, "Parallel PRs").
- For features you actually verified, set the platform to `true` in `docs/features.json`.
- Record a new product decision as a new file in `docs/decisions/`.
- Report to the owner in Chinese, in four parts: 做了什么 / 没做好的地方 / 需要你做的 / 建议下一步.

## Repository settings

- Everyone, agents included, works through the owner's GitHub account; the owner does not use the website.
- The repository is private on a free plan, so GitHub branch protection, rulesets and native auto-merge are not
  available. The merge policy therefore runs inside CI (`merge policy` job), and "never push to `main`" is a rule,
  not something GitHub enforces.
- With GitHub Pro (or a public repository) add a ruleset for `main`: require a pull request (0 approvals), require
  the status checks `lint + tests`, `browser end-to-end`, `handoff updated`, `merge policy`, block force pushes
  and deletions. Then nothing can reach `main` without passing CI.
