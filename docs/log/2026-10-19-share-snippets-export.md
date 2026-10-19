# Share selected 话术 as a document or plain text

- Date: 2026-10-19 · Thread/agent: 功能 · 分享話術導出 (desktop audit item F)
- What changed: The list's 选择 bar on 话术 has a new 导出 menu: 「话术文档（同事可导入）」 saves the selected 话术 as a .md 话术 document (the 导入话术表格 format, D-067: numbered ## folders, **title** + text, [ ] fill-in blocks kept, shared folder note as >), and 「纯文本」 saves a .txt with titles and text, [ ] removed. `snippetShareDocument` / `snippetShareText` in app/snippet-doc.ts; a test imports the exported document back and checks folders, titles, text, fill-ins and duplicate skipping.
- User-visible change (plain Chinese, for the preview changelog): 话术列表「选择」后可以「导出」所选话术：话术文档发给同事，对方在 设置 → 导入话术表格 导入，高亮填空块保留；也可以导出纯文本。
- Not done / risks: Blank lines inside a 话术 are dropped when the document is imported (the importer's rule); per-话术 使用备注 that differ inside one folder are not exported.
- Next step: 无
