# Session log

Newest first. One entry per session: date — who (person or agent) — what was done, what is unfinished, next step.
When this file passes 200 lines, move older entries to `docs/handoff-log-archive.md`.

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
