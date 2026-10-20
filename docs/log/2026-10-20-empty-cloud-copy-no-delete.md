# 云端没有副本时不再当作全部删除

- Date: 2026-10-20 · Thread/agent: 修復 · 雲端空回覆誤刪資料（D-093）
- What changed: `app/cloud-sync.ts` `syncOnce`: when the server answers with no cloud copy, or a copy with no 话术 (or
  no 账号), that section merges against an empty base (first sync again) instead of the last sync's base, so nothing
  here counts as "deleted elsewhere" and the cloud is refilled from this computer. A round with the 账号 page locked
  keeps its old 账号 base. Two tests in `tests/cloud-sync-core.test.mjs` reproduce the loss (15 话术 → 0, and 15 账号
  wiped after a locked computer refilled the cloud) and fail on the old code. D-093.
- User-visible change (plain Chinese, for the preview changelog): 云端副本丢失或为空时，同步不再把这台电脑上的内容删掉
- Not done / risks: the removal guard's "more than 20" floor is unchanged (owner's coordinator: leave it). Deleting every
  话术 or every 账号 on one computer now brings them back from the others.
- Next step: 无
