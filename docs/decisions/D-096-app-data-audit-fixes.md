### D-096 Four app data fixes from the 2026-10-20 audit (2026-10-20)
- Context (owner, 2026-10-20: 「7 修一下」「18 13 11 15 16」): items 7, 15, 16 and 18 of the whole-repo audit are about the
  app's own data.
- 7: switching the 账号 password encryption on or off holds the 账号 and 验证码 save queues (`store-queue.ts`) from its
  first read to its last write. A cloud merge that arrives meanwhile waits; with the old key it then cannot read the moved
  data and fails that round instead of being overwritten while its sync base says it was merged.
- 15: on start, no vault but a copy left by a cut-off import (`hasStashedBackup`) → a 「恢复原来的内容？」 card (same look
  as 删除确认) instead of quietly starting empty. 「先不恢复」 starts empty as before; the copy stays for 设置 › 数据.
- 16: restoring a backup keeps this computer's 登录同步 sign-in (`clipbox.cloud-account.v1`, `clipbox.cloud-session.v1`,
  and the preview's pretend server `clipbox.cloud-demo.v1`); the sync base `clipbox.cloud-sync-base.v1` is still
  cleared, so the next sync is a fresh first merge. Before, a restore signed the computer out and the new sign-in took
  one more of the 3 device places.
- 18: the 「最近」 count stops at 50 (`RECENT_LIMIT`), the number of entries that list shows.
- Storage keys and formats are unchanged.
