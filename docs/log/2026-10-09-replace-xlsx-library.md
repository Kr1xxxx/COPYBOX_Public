# Spreadsheet import no longer uses the vulnerable xlsx library

- Date: 2026-10-09 · Thread/agent: 【工程】 (advisor item 14)
- What changed: `xlsx` (SheetJS 0.18.5, prototype-pollution and ReDoS advisories, no fix on npm) is replaced by
  `read-excel-file` 9.3.5 (published 2026-07-28; the newest, 9.3.12, was two days old) for .xlsx and `papaparse` 5.7.0 for .csv. `app/spreadsheet-read.ts` is the only file that
  imports them and returns plain text tables; `parseSnippetWorkbook` in `app/snippet-import.ts` is now async and keeps
  the same rules (named 话术库 sheet first, else the first sheet with all required columns, same error texts).
  `write-excel-file` is a dev dependency used only by tests to build .xlsx fixtures.
- Checked the same way as before: the old and new readers returned identical rows for `docs/samples/clipbox-test-snippets.csv`
  (37 rows) and for generated .xlsx files with numbers, booleans, blank rows and a repeated column name.
- After acceptance (#49): the new library returns raw numbers and leaves Excel's `_x000D_` escapes, so `app/spreadsheet-read.ts`
  now also reads each numeric cell's number format from the file (via `fflate`, already a dependency of the library)
  and `app/spreadsheet-format.ts` renders it the way Excel shows it (001, 50%, 1,234.50, 0.3, dates, "USD "0.00).
  `_x000D_`-style escapes are decoded. Compared with the old library on the same generated files: identical for every case
  tried. Unknown formats (scientific, fractions) fall back to the plain number. CSV differences: text stays exactly as typed
  (a date or `=1+1` in a CSV is no longer converted).
- After the second acceptance pass: `fflate` is pinned to 0.8.3 (the advisory fixed there), and the Chinese-locale built-in
  date/time formats (ids 27–36, 50–58, e.g. 2023年3月15日) are rendered as Excel shows them instead of as serial numbers.
- Small differences: files over 20 MB are refused ("表格文件太大"); a damaged .xlsx says "无法读取这个表格文件"; column
  names are trimmed. `.xls` was never accepted and still is not.
- User-visible change: 导入话术表格的读取更安全（换掉了有已知漏洞的组件），导入结果不变
- Not done / risks: `npm audit` still lists other packages (Electron build tools, `sharp` via vinext), none of them read user files.
- Next step: 【話術】 (owns the import UI) checks that `await parseSnippetWorkbook(...)` in `app/page.tsx` fits its work.
