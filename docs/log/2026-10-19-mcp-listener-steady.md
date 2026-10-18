# Outside command listener stays subscribed across section switches

- Date: 2026-10-19 · Thread/agent: 審計 · 檢查 PR #225 和 #226
- What changed: Review of PR #225 and #226. #225 added `activeKind` to the outside command (MCP) effect's dependencies, so every switch between 话术, 图片 and 账号 unsubscribed and subscribed the listener again. The desktop bridge subscribes asynchronously, so a command arriving in that gap was dropped and the AI tool waited until its timeout. The effect now reads the section from `activeKindRef` and subscribes once, like the other refs it reads.
- User-visible change (plain Chinese, for the preview changelog): 无
- Verification: lint, typecheck, unit tests and the full browser run; a new browser test checks that switching sections keeps the same listener and that a later MCP folder rename still moves the selection.
- Not done / risks: The rest of #225 and #226 checked out (folder rules, image write queue and restore gate, canonical image folder rename); no other change.
- Next step: 无
