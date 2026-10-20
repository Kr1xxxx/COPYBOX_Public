# 话术 title optional

- Date: 2026-10-20 · Thread/agent: 功能 · 话术标题可不填
- What changed: the 话术 editor saves with an empty 标题 and uses the content's first line (≤20 characters) instead (D-104). `app/item-editor.tsx`, `app/clipbox-core.ts`.
- User-visible change (plain Chinese, for the preview changelog): 新增话术时标题可以不填，留空就用正文第一行
- Not done / risks: English first lines are cut at 20 characters, possibly mid-word; command line/MCP still require a title.
- Next step: 无
