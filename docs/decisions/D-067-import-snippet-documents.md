### D-067 导入话术 also reads a 话术 document, whose chapters become folders (2026-10-15)
- Context (owner, 2026-10-15: 「对于话术的导入,写一下对于模板输入的要求,后续直接导入即可,不用做适配了」): after D-066 the
  owner wants to import a document shaped like 《标准话术库(第三版)》 himself, without an agent adapting each file.
- Decision: 设置 → 导入话术表格 also accepts .md (owner, 09:19Z: 「要求只能 MD 或者表格,其他不支持」). `app/snippet-doc.ts` reads it (the same parser as
  `tools/preset-library.mjs`): `##` = folder, `###` = section, `**…**` = one 话术, plain lines = the message, `>` under a
  folder = 使用备注, `[ ]` = fill-in blocks. The usual import dialog shows the count and folders; the chapters are added as
  folders in the document's order (after the standard folders in a build without built-in 话术). Same-title same-text
  话术 are skipped, as for spreadsheets. Template for the owner: `docs/snippet-doc-template.md`.
- Consequences: no storage format change; imported 话术 are ordinary 话术 (not company-linked, so a changed line imports
  as a new 话术). Spreadsheet import is unchanged.
- Status: Accepted.
