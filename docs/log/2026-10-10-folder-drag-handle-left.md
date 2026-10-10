# Sidebar folders: three-bar drag handle on the left

- Date: 2026-10-10 · Thread/agent: 【圖片】宮格與動效
- What changed: the drag handle of a sidebar folder moved from the far right (a ⠿ glyph) to the far left and became three horizontal bars (`grip` icon). It appears on hover or keyboard focus over the colour dot (the dot fades out while it shows), and you press and drag to reorder, right in the sidebar. The ⋯ menu button now sits at the right edge. The order is the same saved list that Settings > 目录 edits (`folders[kind]` through the same persist), so both places always agree; an e2e test drags in the sidebar and compares with Settings.
- User-visible change (plain Chinese, for the preview changelog): 侧边栏的目录最左边多了三横把手,按住就能直接拖动排序,和设置里的目录顺序是同一份。
- Not done / risks: only the folders that can already be sorted get a handle (the 话术/秘密 folders you created); the standard 话术 folders are fixed by an existing rule, and 图片 folders have no saved order at all today (not sortable in Settings either), so they have no handle; sorting them would need a new store method on the folder list. Handle shows on hover only (on a touch screen there is no hover). Checked in the browser with Windows and Mac styling, light and dark. Local commit only (freeze).
- Next step: the owner decides whether 图片 folders and the standard 话术 folders should become sortable.
