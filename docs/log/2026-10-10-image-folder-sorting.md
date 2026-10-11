# 图片 folders can be sorted (sidebar handle and Settings)

- Date: 2026-10-10 · Thread/agent: 【圖片】宮格與動效
- What changed: 图片 folders now have the same three-bar drag handle as 话术 folders (hover over the dot, press and drag), and Settings > 图片目录 can drag and move them up and down. Both change one saved order. Storage: the folder list was already saved as an ordered array in the encrypted folder record, so the new `reorderFolders` just writes that same record with the folders in the new order; nothing is migrated (old data keeps its current order), images and colours are not touched (unit test compares image bytes, colours and image folders).
- User-visible change (plain Chinese, for the preview changelog): 图片目录也能拖动排序了:侧边栏目录最左边的三横把手按住拖动,设置里也能排,两边顺序一致。
- Not done / risks: it rewrites the folder record (same format as create/rename/colour already do); not looked at on a real Windows or Mac desktop, only in the browser with both styles, light and dark. Local commit only (freeze).
- Next step: none.
