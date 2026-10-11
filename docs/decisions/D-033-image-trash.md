### D-033 图片 have a 回收站 (2026-10-11)
- Context (owner, 2026-10-11, advisor idea 9: "做一下"): deleting a picture used to remove the encrypted record, the original and the
  thumbnail at once; a wrong click lost the picture. 话术 already has a 回收站 with 撤销 and automatic cleanup.
- Decision: deleting a picture only sets `deletedAt` (a time) on its record; the original and the thumbnail stay. A 6-second
  撤销 toast, a 回收站 entry above 设置 in the 图片 sidebar (not in the mini window), 恢复 and 永久删除 (with the old confirmation) there. Pictures that
  have been in the 回收站 longer than the existing setting (default 7 days, D-022) are removed for good the next time the 图片
  section is opened. 永久删除 is the old `remove` and deletes only the chosen picture.
- Consequences: the field is optional like `pinned`: records without it are normal pictures, nothing is migrated. A version
  that does not know the field shows trashed pictures as normal ones until it is updated (they are never lost).
  Deleting a folder also clears the folder of trashed pictures, so a restored one lands in 未分类. Rollback = revert the PR;
  trashed pictures would then show as normal ones.
- Status: Accepted. Storage change: merges only after the owner writes 合并.
