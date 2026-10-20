### D-106 Mini window without boxes: text tabs, 公司 / 我的 behind a filter icon, no Windows title bar (2026-10-20)
- Context: D-101 put 「公司」「我的」 left of 「选择」 in the full window only. Krix 2026-10-20: 「迷你窗口还没有「公司 / 我的」筛选
  做一下」, then 「Mini 的UI 想办法优化一下,我觉得全是按钮有点不对」. From three mockups he picked B with A's top row:
  「B 吧,但是 B 的最顶部要改成和A一样的,全部收藏最近还是放在顶部,不用滑动就可以直接展示 6 项目」, and liked dropping the boxes.
  The same day 「UI 又穿膜了」: while searching, 中文拼音 / 英文单词 broke onto two lines in the full window's head.
- Decision:
  - Mini window tabs (全部 / 收藏 / 最近 on top, folders under the search box) are plain text; the picked one is accent text
    with a short underline. Only the 话术 / 图片 / 账号 switch keeps a box. Six folders show without sliding.
  - 公司 / 我的 sit behind a filter icon at the right end of the mini search box: a menu 全部 / 公司 / 我的; the icon is
    filled with the accent colour while one is picked. Same state as the full window's buttons.
  - Windows: the mini window has no system title bar (the full window keeps it). Its top row drags the window and holds
    恢复完整窗口 and ✕; ✕ is a normal close, so it follows 关闭按钮 in Settings (tray by default).
  - Full window: while searching, 中文拼音 / 英文单词 and 此目录 / 全部目录 get their own row under the head and never wrap.
  - The mini window was already above all other windows without 固定 (unchanged; `stays_on_top`).
- Not done: the mini window has no 全部产品 filter. The frameless Windows mini window was not tried on a real PC.
