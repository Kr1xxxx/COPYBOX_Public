@AGENTS.md

## Claude Code: coordinator and workers (owner's request, 2026-10-09)

- The main session is the coordinator (Opus, high effort; `.claude/settings.json`). It writes the spec and plan,
  then hands each piece to a worker with a detailed prompt it wrote itself.
- Workers run Opus at medium effort (owner's request, 2026-10-13; `.claude/agents/worker.md`,
  `CLAUDE_CODE_SUBAGENT_MODEL`). The coordinator picks another setting only when a piece needs it and says why.
- Independent pieces run in parallel, each in its own git worktree (`isolation: "worktree"`). Workers commit
  locally and never push.
- Web preview (the published page the owner opens in the side panel): its version number sits top-left of the page and
  goes up by 0.01 with every update. Only the preview publisher (the coordinator; there are no separate threads since
  2026-10-13) bumps `tools/preview/VERSION`, edits `changelog.json` and republishes (`tools/preview/README.md`). The publisher ends its report with the version number; the current number is in
  `tools/preview/VERSION`.
- The coordinator reviews every worker's diff, merges the branches, fixes what is wrong, runs lint and all tests,
  and only then pushes, opens the PR and merges it per AGENTS.md "Merging". Code reviews, refactors and migrations can also go to a worker, always
  with a prompt written by the coordinator.
