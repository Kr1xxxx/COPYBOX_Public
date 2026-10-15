# Company 话术 library file

A JSON file the app can sync from (Settings → 共享话术): a 同步码, an address, or 选公司文件…. The person who maintains
the company 话术 creates it from their own app with 导出为公司话术库文件; an agent publishes it (below, D-052).

```json
{
  "format": "clipbox-shared-library",
  "version": 1,
  "items": [
    {
      "id": "CO-001",
      "folder": "询盘接待",
      "label": "公司 · 开场问候",
      "secret": "Hi [Name], thanks for contacting us!",
      "chineseText": "你好 [Name]，感谢联系我们！",
      "summary": "确认需求",
      "scene": "开场问候",
      "action": "确认需求",
      "rawProduct": "睫毛",
      "usageNote": ""
    }
  ]
}
```

- `id` (stable, never reused), `label`, `secret` (the English text) are required; the rest is optional.
  `folder` must be one of the standard folders, otherwise 询盘接待.
- Change an entry by keeping its `id` and changing its text. Removing an entry from the file only marks it
  「公司已停用」 on every device.
- Samples: `docs/samples/shared-library-v1.json` and `-v2.json` (v2 changes two entries, drops one, adds one).
- Rules and why: D-026 in `docs/decisions/`; code in `app/shared-library.ts`.
- Published per 同步码 at `https://copyboxx.com/sync/<code>/snippets.json` with `npm run sync:publish` (see
  `tools/website/README.md`, "话术同步").

## 同步码 and publishing (D-052)

- Each group of people gets a 同步码 such as `XS-7KQ2M9AB` (two letters for the group, a dash, 8 random characters).
  The app turns it into `https://copyboxx.com/sync/<CODE>/snippets.json` (`sharedSourceUrl` in `app/shared-library.ts`),
  syncs on start and every 30 minutes, and shows nothing unless something changed. No code = no sync.
- The website Worker serves that file from KV key `sync/<CODE>/snippets.json`; a wrong code and a missing file both give
  the same 404. `website:deploy` never touches `sync/`. There is no admin page or upload address on purpose.
- How the owner publishes: export with 导出为公司话术库文件, send the file in the project with the group (code) it is for,
  and say 发布. The agent (with `npm run sync:publish`, see `tools/website/README.md`, "话术同步"):
  1. checks the file with the same rules as `parseSharedLibrary` and reports, against the live file for that code, which
     entries are new, changed and removed (removed ones only become 「公司已停用」 on devices);
  2. uploads only after the owner writes 发布 / 部署 in that thread, keeping the previous file under
     `sync/<CODE>/history/` so 退回上一版 restores it;
  3. confirms by fetching the live address.
- Never put a live 同步码 in the repo, the public site or a commit message. To remove someone from a group, create a new
  code for it and give it to the people who stay.
- Accounts (later step) are sent without passwords: site, user name and note only.

## 更新通知 with a push (D-071)

A push can carry a short notice that each device shows once (「公司话术有更新」, 「不用更新软件，已经自动同步好了」):
`"notice": {"id": "XS-…-202610151340", "title": "公司话术有更新", "items": ["新增 12 条话术", "新增 5 条 Tips"]}` at the top
level of the file. `npm run sync:publish -- … --notice notice.txt` writes it from a text file (one line per item) with a
new id. Only notable additions; the owner approves the lines first (docs/whats-new.md). A device getting the library for
the first time only remembers the id; a broken notice is ignored and never blocks the 话术.

## Built-in 话术 in a company build (D-066)

`node tools/preset-library.mjs <标准话术库.md> [--json library.json]` writes `app/preset-library.ts`; `--clear` empties it
(the public repo keeps it empty). With entries, their chapters become the standard 话术 folders and the app adds them on
start when no 同步码 is set, with the same rules as a synced library. `--json` writes the same entries as a library file
for `npm run sync:publish`, so a 同步码 can carry them without retiring anything. Sample: `docs/samples/standard-library-sample.md`.
