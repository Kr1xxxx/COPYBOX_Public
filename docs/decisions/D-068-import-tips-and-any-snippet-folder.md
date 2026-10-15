### D-068 Tips can be imported in the app; a 话术 table can name any folder (2026-10-15)
- Context (owner, 2026-10-15: 「继续对 对话 ,以及 tips 做好适配,可以直接导入的,而不是你去写代码」): 话术 and Tips files
  should go in by the owner's own import, with no code change per file; only .md documents and .xlsx / .csv tables.
- Decision:
  - 设置 → 数据 → 导入 Tips reads a .md document in the docs/company-tips.md shape (`app/tips-doc.ts`, the same parser
    `tools/company-tips.mjs` uses) or a table with 标题 / 内容 / 正确写法 / 错误写法 / 来源. Imported tips are kept in
    `clipbox.tips.v1` under a new optional `imported` list with their examples and source (longer limits than online tips:
    title 40, text 1000). A tip is known by its title: the same title updates it, a shipped title replaces that tip.
  - 导入话术表格: a 沟通阶段 that is not a standard folder (or an old name for one) now becomes a folder of that name instead
    of an error, so a table can follow the company's own chapters like a .md document (D-067).
- Consequences: the Tips key keeps version 1; older apps ignore `imported`. Nothing is removed by an import. Templates:
  docs/snippet-doc-template.md, docs/tips-doc-template.md.
- Status: Accepted.
