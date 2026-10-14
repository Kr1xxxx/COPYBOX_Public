# Branch cleanup keeps the electron-last bookmark

- Date: 2026-10-14 · Thread/agent: coordinator
- What changed: .github/workflows/prune-branches.yml now always keeps `electron-last` (D-034 names it as the way back to the last Electron version); the dry run had listed it because it is fully merged. Deletes now name `refs/heads/<branch>` so a tag with the same name can never make the delete ambiguous.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: none; the dry run before this listed 88 merged branches and kept 20.
- Next step: run the workflow with dry run off.
