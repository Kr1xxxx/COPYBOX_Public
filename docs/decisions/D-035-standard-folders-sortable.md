### D-035 The standard 话术 folders can be sorted (2026-10-11)
- Context (owner, 2026-10-11: "这个目录鼠标按住可以拖动,改一下", screenshot of the seven standard folders): D-009 made the
  standard folders (询盘接待, 产品样品, 报价成交, 定制生产, 客户跟进, 物流清关, 售后争议) fixed: colour only, in a fixed place.
- Decision (owner): they can be dragged to another place like any other folder, in the sidebar (six-dot handle, press and drag,
  or click the handle for 上移 / 下移) and in Settings. This replaces only the "fixed place" part of D-009: they still cannot be
  renamed or deleted.
- Consequences: the folder list was already saved in order. Reading it back used to rebuild "standard folders first"; now a saved
  list that contains all seven standard folders keeps its order, and an incomplete or older list is rebuilt exactly as before, so
  existing data reads the same until the owner moves something. Nothing is migrated and no format changes. Rollback = revert the
  PR (a saved custom order then reads as standard-first again; nothing is lost).
- Status: Accepted.
