### D-066 A build can ship the company's 话术, and its chapters become the 话术 folders (2026-10-15)
- Context (owner, 2026-10-15: 「把这个话术 做好适配,然后安装到私有版里」 with 标准话术库(第三版).md, then 「注意目录按照这个标准话术来,
  并且该用高亮块替换的部分,你设置一下」): the staff installer is built from the private repo and should open with the
  company's standard 话术, sorted in the document's own 11 chapters, with the [ ] parts as fill-in blocks.
- Decision: `tools/preset-library.mjs <document.md>` writes `app/preset-library.ts` (folders + entries, ids STD-1.1-01, …).
  The public repo keeps it empty, so the public build is unchanged. When it has entries:
  - its folders replace the seven standard folders of D-009 / D-035 (same rules: they can be sorted, not renamed or deleted;
    a person's own folders and the entries already in the old folders stay);
  - on start, if no 同步码 is set, the app adds and updates these entries exactly like a company library (D-026): an entry
    the person edited keeps their text, one they deleted does not come back, one dropped from a later document becomes
    「公司已停用」. A 同步码 takes over from the built-in 话术; publish the same file for that code (`--json`) so nothing is
    retired.
  - [名字], $[金额] and every other [ ] part is a fill-in block, as in any 话术.
- Consequences: no storage key or format changes; the entries carry the usual `shared` link. A spreadsheet import in such a
  build accepts the new folder names, and the old seven only where a folder of that name exists. Rollback = run
  `node tools/preset-library.mjs --clear` in that build.
- Status: Accepted.
