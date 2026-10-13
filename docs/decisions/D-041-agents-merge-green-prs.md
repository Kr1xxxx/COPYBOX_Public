### D-041 Agents merge green PRs themselves; only high-risk PRs wait for 合并 (2026-10-13)
- Context: D-011 made every "big" PR (`needs-owner`: `src-tauri/`, dependencies, CI, the rulebook, more than 350 app
  lines, `major`, …) wait for the owner's 合并. In practice the owner was asked to approve PRs he cannot judge and was
  annoyed by the waiting. On 2026-10-13 the owner moved Clipbox to a single main agent and set new rules; the old rule
  files (AGENTS.md, CONTRIBUTING.md, CLAUDE.md) and the new agent notes then contradicted each other.
- Decision (owner, "照做" on 2026-10-13): an agent opens PRs without asking and merges a PR itself once all checks on
  the latest commit are green and there is no conflict, whatever its size or files. Only **high-risk** PRs wait for the
  owner to write 合并: anything that could lose, corrupt or lock user data (storage or encryption format, storage keys,
  migrations, the save / restore / key path, deleting user data), releasing to staff, and irreversible actions. Tests
  and CI gates are never weakened to get green. Sub-agents (workers) run Opus at medium effort.
- Consequences: `scripts/classify-pr.mjs` still labels big PRs `needs-owner`; the label now informs, it does not stop
  the merge. AGENTS.md "Merging" is the single place for these rules; `docs/agent-notes.md` points there.
- Supersedes: the waiting part of D-011 (its size classification stays as information).
- Status: Accepted.
