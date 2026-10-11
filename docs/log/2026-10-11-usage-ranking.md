# 话术使用排行（本机部分）

- Date: 2026-10-11 · Thread/agent: 【設置】设置页
- What changed: New Settings page 使用排行 (after 数据): 最常用 (top 10 with counts), 30 天没用过, 从来没用过; a row jumps to that snippet in the list. It reuses the `useCount` / `lastUsedAt` the vault already keeps (no new storage, no format change). New `recordCopy` in `app/usage-ranking.ts`: copying the same snippet again within 60 s counts once (this is the "排除高频复制" reading, being confirmed with the owner). Only 话术 are ranked; nothing typed into highlighted blocks is recorded. Existing counts from before this change may include fast repeats.
- User-visible change (plain Chinese, for the preview changelog): 设置新增「使用排行」：最常用、30 天没用过、从来没用过；同一条话术一分钟内连续复制只算 1 次。
- Not done / risks: Upload to the cloud/server is not built (waits for the company address and the owner's yes; D-016). Per-day history is not kept (the three lists do not need it). Built on the two-column Settings branch (#52 plus 关于 version/time).
- Next step: owner picks the page position (default: after 数据); then upload when the address is set.
