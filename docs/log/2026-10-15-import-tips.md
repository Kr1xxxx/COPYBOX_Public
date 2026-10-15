# Import Tips in the app; 话术 tables can name any folder

- Date: 2026-10-15 · Thread/agent: 话术适配
- What changed: New 设置 → 数据 → 导入 Tips (.md document or .xlsx/.csv table, `app/tips-doc.ts`, `app/tips-import.tsx`), stored as `imported` in the Tips state; tools/company-tips.mjs reuses the parser. 导入话术表格 now creates a folder for any 沟通阶段 instead of refusing it (D-068). Templates for the owner: docs/tips-doc-template.md, a table section in docs/snippet-doc-template.md.
- User-visible change (plain Chinese, for the preview changelog): 设置 → 数据 新增「导入 Tips」，可以直接选 .md 文档或表格；话术表格里的「沟通阶段」写什么目录名都能导入，没有的目录会自动新建
- Not done / risks: No way to remove imported Tips yet (they never get deleted by an import). Not tried on real Windows/Mac.
- Next step: 无
