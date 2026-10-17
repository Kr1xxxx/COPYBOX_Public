# Pin folders to the top (目录置顶)

- Date: 2026-10-17 · Thread/agent: 功能 · 目录置顶
- What changed: The folder ⋯ menu (话术 sidebar and 图片 sidebar) starts with 置顶 / 取消置顶. Pinned folders sit on top in the order they were pinned and show a small pin; the mini window tabs follow the same order. Pins are kept on this device in `clipbox.folder-pins.v1` (new UI preference key, not part of the vault or backups); the saved folder order is unchanged, so 取消置顶 puts a folder back where it was. Moving and dragging stay inside a group (pinned with pinned). Rename and delete keep the pins in step. Logic in `app/folder-pins.ts`; `app/page.tsx` touched only around the folder list, the folder menu and the folder rename/delete functions.
- User-visible change (plain Chinese, for the preview changelog): 目录的「⋯」菜单新增「置顶」，置顶的目录排在最上面，可再选「取消置顶」
- Not done / risks: Pins are per device and not in backups or cloud sync. Settings → 目录 still lists folders in their saved order.
- Next step: 无
