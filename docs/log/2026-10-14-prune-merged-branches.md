# Manual job that deletes branches already merged into main

- Date: 2026-10-14 · Thread/agent: coordinator
- What changed: new workflow .github/workflows/prune-branches.yml (run by hand, main only, dry run by default) deletes remote branches that are fully merged into main; branches with commits main lacks, branches used by an open pull request, and main itself are kept. The owner asked for it (清分支) because this session's git access cannot delete branches.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: a deleted branch can be restored from its merged pull request on GitHub.
- Next step: 无
