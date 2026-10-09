# Parallel PRs stop conflicting on docs and preview files

- Date: 2026-10-09 · Thread/agent: 【工程】 (advisor item 13)
- What changed: handoff notes are now one new file per PR in `docs/log/`, decisions one new file each in
  `docs/decisions/`; `docs/HANDOFF.md`, `docs/handoff-log.md` and the `docs/DECISIONS.md` table are frozen for feature
  PRs. `tools/preview/VERSION` and `changelog.json` belong to the preview publisher; CI warns when another PR edits
  them. `scripts/check-handoff.mjs` now asks for a new `docs/log/` note (the old HANDOFF.md update still passes, so
  PRs opened earlier are not broken). Rules are in AGENTS.md ("Parallel PRs"), CONTRIBUTING.md, CLAUDE.md, the PR template.
- User-visible change: 无
- Not done / risks: the preview-file rule is a CI warning, not a failure (cannot tell the publisher's PRs apart yet);
  `docs/features.json` can still conflict.
- Next step: open PRs (#38, #39, #41 and later) rebase and switch to a `docs/log/` note.
