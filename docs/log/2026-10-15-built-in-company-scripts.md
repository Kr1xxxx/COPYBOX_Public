# Built-in company 话术 for the staff build

- Date: 2026-10-15 · Thread/agent: 话术适配
- What changed: New `tools/preset-library.mjs` turns the company's 标准话术库 Markdown into `app/preset-library.ts` (empty in the public repo). A build with entries uses the document's chapters as the standard 话术 folders and adds the entries on start when no 同步码 is set, through the company-library sync (D-066).
- User-visible change (plain Chinese, for the preview changelog): 无（公开版不变；员工版自带公司标准话术，目录按标准话术的 11 个章节）
- Not done / risks: The real 话术 (142 entries, /mnt/project-files/scripts-library/) go only into the private repo. Checked in the browser with them loaded; not yet on real Windows/Mac.
- Next step: Private repo: sync, run `node tools/preset-library.mjs 标准话术库-v3.md`, build the staff installer.
