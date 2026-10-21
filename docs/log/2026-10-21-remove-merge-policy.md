# Remove the PR-only merge-policy CI job

- Date: 2026-10-21 · Thread/agent: 功能 · 去掉找回邮箱
- What changed: removed the `merge-policy` job from `.github/workflows/ci.yml`, `scripts/classify-pr.mjs` and its two
  tests (`tests/classify-pr.test.mjs`, `tests/ci-merge.test.mjs`); the stale `needs-owner` sentence in AGENTS.md. The
  job only ran on pull requests, which CI no longer does (D-090); agents merge per D-041. Ponytail audit 2026-10-20 #20,
  Krix 2026-10-21 「删」.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: if PR runs are switched back on, nothing merges small PRs automatically any more (agents still do).
- Next step: 无
