# Click the drag handle: 上移 / 下移 menu

- Date: 2026-10-11 · Thread/agent: 【圖片】宮格與動效
- What changed: a single click (no drag) on any six-dot handle opens a small menu with 上移 and 下移; the one at the top (or bottom) of its group is greyed out. New `app/reorder-handle.tsx` wraps the handle: press-and-drag still goes to `usePointerReorder`, a press that moved more than 5 px is a drag and opens nothing. Used for 话术 cards (a card only swaps with a neighbour of its own pinned/unpinned group, same as drag), 话术 folders and 图片 folders in the sidebar (a folder only swaps with another movable one; the fixed standard 话术 folders have no handle), and the Settings folder rows. Moving writes the same order the drag writes; nothing about storage changes.
- Left out on purpose: the ⌥↑ / ⌥↓ hints from Lock's screenshot (D-005: no keyboard shortcuts; showing hints that do nothing would mislead) and 隐藏 (no draggable thing here can be hidden: cards and folders only exist or are deleted, so there is nothing to hide to). Both need Lock's word.
- User-visible change (plain Chinese, for the preview changelog): 点一下六点把手会弹出「上移 / 下移」小菜单,到顶或到底的那项变灰;按住拖动照常可用。
- Not done / risks: not looked at on a real desktop, only in the browser (Windows and Mac style, light and dark). Local commit only (freeze).
- Next step: Lock decides on 隐藏 and the shortcut hints.
- Remembered values (常用值) in the 话术 strip got the same six-dot handle (`ReorderHandle`): press and drag reorders, a click opens 上移 / 下移. The value text is its own button that still fills; the right-click menu (固定 / 解锁 / 删除) is unchanged. Dragging now follows the pointer, not the middle of the value. No 隐藏 and no shortcut hints (waiting for Lock). Position of the strip did not move.
