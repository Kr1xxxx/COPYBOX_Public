# Mini window: one top row with scrolling folder tabs

- Date: 2026-10-12 · Thread/agent: 【話術】迷你窗口顶部重排
- What changed: In the mini window the top is now one row: the 话术/图片 switch pinned at the left, then 全部, 收藏, 最近 and the folders as tabs that scroll sideways (press and drag with the mouse, wheel, trackpad). The folder dropdown inside the search box is gone; the 最常用 chips row and the restore button stay where they were. In the 图片 mini window the same row holds 全部, 收藏, the image folders and 未分类. The row stops the desktop shell's top-band window drag, so dragging it only scrolls.
- User-visible change (plain Chinese, for the preview changelog): 迷你窗口顶部改成一行:左边固定「话术 / 图片」,右边是「全部、收藏、最近、各个目录」,可以按住左右拖动;搜索框里的目录下拉去掉了。
- Not done / risks: Dragging with a real mouse on Windows and Mac hardware is not tried; web tests cover it. Interacts with PR #85 (window drag): the row stops mouse-down from reaching that handler, no change to bridge.js needed.
- Next step: Lock looks at it in the web trial.
