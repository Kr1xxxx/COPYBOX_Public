# 图片 回收站

- Date: 2026-10-11 · Thread/agent: 【圖片】宮格與動效
- What changed: deleting a picture now moves it to a 回收站 (6-second 撤销 toast) instead of removing it. `ImageMeta` gets an optional `deletedAt`; `store.trash(id)` / `store.restore(id)` rewrite only that field of the encrypted meta record (the original and the thumbnail are not touched); `store.remove(id)` is unchanged and is now only used for 永久删除 (after the old confirmation) and the automatic cleanup. The library splits `images` (active) and `trashed`; counts, folders, favourites and the mini window only see active ones. Sidebar: 回收站 (with a count) above 设置 in 图片, like 话术. Auto-cleanup uses the same days setting as 话术 (default 7) and runs when the 图片 section has been read. Docs: D-032, features.json.
- Storage risk (high-risk, waits for 合并): one new optional field in the encrypted meta JSON. Tests: store (trash keeps bytes, restore returns the record exactly as before, 永久删除 removes only the chosen one and the other trashed image can still be restored, unknown ids refused, deleting a folder then restoring), core (split, order, expiry), e2e (delete → 撤销; 恢复; 永久删除 asks and removes only that one; reload keeps the 回收站; counts ignore trashed ones; empties itself after 8 days but not after 1 day).
- User-visible change (plain Chinese, for the preview changelog): 图片删除后先进回收站，6 秒内可撤销；回收站里可以恢复或永久删除，超过保留天数（默认 7 天）自动清理。
- Not done / risks: cleanup only runs after the 图片 section is opened (nothing is read before). Not looked at on a real desktop, only in the browser. Local commit only (freeze).
- Next step: Lock says 合并.
