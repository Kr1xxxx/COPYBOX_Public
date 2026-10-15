# New decisions

`docs/DECISIONS.md` holds D-001 to D-021 and stays as it is. A new decision is a **new file**
`docs/decisions/D-NNN-short-name.md` (same format as there: context, decision, consequences, status). Do not add
rows to the table in `DECISIONS.md`; the coordinator adds each merged decision to the linked index below that table.

Pick the next free number by looking at `docs/DECISIONS.md`, this folder and the open PRs
(`gh pr list --state open`). `tests/docs-structure.test.mjs` fails when two files claim the same number.
