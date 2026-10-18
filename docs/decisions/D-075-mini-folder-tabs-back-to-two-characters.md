### D-075 The mini window's folder tabs go back to two characters (2026-10-18)
- Context (owner, 2026-10-18: 「mini 窗口的恢复 2 个字」): D-074 (#223) made the mini window's folder tabs show four
  characters. The owner looked at it and wants the earlier two-character tabs back.
- Decision: **D-074 is withdrawn**; the length rule of D-049 applies again, unchanged:
  - Folder tabs in the mini window show a folder's first **two** characters (an emoji counts as one), or up to
    **four** Latin letters/digits.
  - The seven standard 话术 folders show their fixed two-character labels again (询盘, 产品, 报价, 定制, 跟进, 物流, 售后).
  - A short name set in 设置 → 目录 → 「⋯」 may be up to two characters (four Latin letters/digits); longer is refused
    with 「最多两个字」. The placeholder shows the first two characters.
- How: PR #223's code change (merge e4b1e84) is reverted as is. The e2e wait fix from #224 stays.
- Storage: none changed. A short name of three or four characters saved while D-074 was live is read as invalid and
  dropped on the next save; the folder then shows its default label. Nothing else is lost.
- Status: Accepted (owner choice 2026-10-18). Supersedes D-074.
