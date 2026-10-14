# Company 话术 library file

A JSON file the app can sync from (Settings → 共享话术): an address, or 选公司文件…. The person who maintains the
company 话术 can create it from their own app with 导出为公司话术库文件 and put it where the address points.

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
