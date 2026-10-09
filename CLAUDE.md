@AGENTS.md

## Claude Code: coordinator and workers (owner's request, 2026-10-09)

- The main session is the coordinator (Opus, high effort; `.claude/settings.json`). It writes the spec and plan,
  then hands each piece to a worker with a detailed prompt it wrote itself.
- Workers default to Sonnet at medium effort (`.claude/agents/worker.md`, `CLAUDE_CODE_SUBAGENT_MODEL`). The
  coordinator picks another setting only when a piece needs it (e.g. Sonnet high for tricky logic, Opus medium for
  storage or encryption) and says why.
- Independent pieces run in parallel, each in its own git worktree (`isolation: "worktree"`). Workers commit
  locally and never push.
- The coordinator reviews every worker's diff, merges the branches, fixes what is wrong, runs lint and all tests,
  and only then pushes and opens the PR. Code reviews, refactors and migrations can also go to a worker, always
  with a prompt written by the coordinator.
