### D-062 账号 gets a 笔记 category in Markdown, and a note can become a login and back (2026-10-15)
- Context (owner, 2026-10-15): 「账号里添加一个笔记分类，可以随意记录，用 MD 格式即可」 and 「增加"转为登录/API"入口：预览字段对应
  关系后保存，并保留原文供回退」.
- Decision: a note is a new entry type (`type: "note"`, `name`, `body`) in the existing 账号 store
  (`clipbox.vault-items.v1`, same encryption and storage key), so backups, export and import carry it with no format
  change. Markdown is parsed into plain data (`app/note-core.ts`) and drawn by React: no raw HTML ever reaches the page,
  and only http(s) addresses become links. 「转为登录」 shows each login field with the note line it came from, lets the
  person change it, and saves in one write that replaces the note with the login; the login keeps the whole note in
  `fromNote`, so 「看原文」 shows it and 「还原为笔记」 puts it back exactly as it was (changes made to the login are dropped).
- Consequences: older app versions keep the note in the store but do not show it. 「转为 API」 follows once the API entry
  has several secret fields (D-061).
- Status: accepted (owner's request, 2026-10-15).
