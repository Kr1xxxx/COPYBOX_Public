# Spreadsheet import no longer uses the vulnerable xlsx library

- Date: 2026-10-09 · Thread/agent: 【工程】 (advisor item 14)
- What changed: `xlsx` (SheetJS 0.18.5, prototype-pollution and ReDoS advisories, no fix on npm) is replaced by
  `read-excel-file` 9.3.12 for .xlsx and `papaparse` 5.7.0 for .csv. `app/spreadsheet-read.ts` is the only file that
  imports them and returns plain text tables; `parseSnippetWorkbook` in `app/snippet-import.ts` is now async and keeps
  the same rules (named 话术库 sheet first, else the first sheet with all required columns, same error texts).
  `write-excel-file` is a dev dependency used only by tests to build .xlsx fixtures.
- Checked the same way as before: the old and new readers returned identical rows for `docs/samples/clipbox-test-snippets.csv`
  (37 rows) and for generated .xlsx files with numbers, booleans, blank rows and a repeated column name.
- Small differences: files over 20 MB are refused ("表格文件太大"); a damaged .xlsx says "无法读取这个表格文件"; column
  names are trimmed. `.xls` was never accepted and still is not.
- User-visible change: 导入话术表格的读取更安全（换掉了有已知漏洞的组件），导入结果不变
- Not done / risks: `npm audit` still lists other packages (Electron build tools, `sharp` via vinext), none of them read user files.
- Next step: 【話術】 (owns the import UI) checks that `await parseSnippetWorkbook(...)` in `app/page.tsx` fits its work.
