### D-104 A 话术 can be saved without a title (2026-10-20)
- Context: the 话术 editor kept 「保存」 grey until 标题 was filled, which slowed staff adding quick replies.
  Desktop audit item E (old item 17); Krix 2026-10-20: 「改成可以不填」.
- Decision: for 话术 the title is optional. Left empty, it becomes the first non-empty line of the content, spaces
  collapsed, cut to 20 characters (`titleFromContent` in `app/clipbox-core.ts`). Staff can still type or edit it.
  The title box shows 「可不填，默认用第一行」.
- Unchanged: 账号/秘密 entries still need a title; the `clipbox` command line and MCP still reject an empty title.
