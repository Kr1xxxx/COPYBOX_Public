# Import a 话术 document directly

- Date: 2026-10-15 · Thread/agent: 话术适配
- What changed: 导入话术表格 now also takes .md 话术 documents (only .md, .xlsx and .csv, per the owner) in the 标准话术库 shape (`app/snippet-doc.ts`, D-067); chapters become folders, [ ] parts fill-in blocks. `tools/preset-library.mjs` now uses the same parser. Template: `docs/snippet-doc-template.md`.
- User-visible change (plain Chinese, for the preview changelog): 「导入话术表格」也能直接选 .md 话术文档，文档里的章节自动变成目录，[ ] 里的内容变成可填的高亮块
- Not done / risks: Only .md documents and .xlsx/.csv sheets; Word, .txt and other formats are not supported (owner's rule). Not tried on real Windows/Mac.
- Next step: 无
