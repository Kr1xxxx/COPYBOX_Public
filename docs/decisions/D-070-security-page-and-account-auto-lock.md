### D-070 Settings has a 安全 page; the 账号 page locks again on its own (2026-10-15)
- Context (owner, 2026-10-15: 「设置页 单独设一个安全,把安全类的放进去,包括新增功能,账号页面默认是解锁后 20秒保持解锁状态,20 秒过后上锁,可以自己设置 10 秒 20 秒 30 秒 和不上锁,不上锁加一个确认按钮」).
- Decision:
  - **安全 page.** 设置 gets its own 安全 group, right after 数据 (概览, 目录, 数据, 安全, 使用排行, 窗口, AI, 关于). It holds the
    「安全」 card (账号页密码 with its recovery code, 打开账号页先滑动解锁, the new 账号页自动上锁, and the notes on encryption
    and where the key lives) and 「始终允许的程序」 (Mac only, as before). 概览's 「安全设置」 button opens it.
    Left where they were: 导出账号备份 and 完整备份 (数据), image-compression keys (数据 → 图片压缩), the AI key (AI),
    连接 Codex 等工具 (AI).
  - **Auto-lock.** 「账号页自动上锁」: 10 秒 / 20 秒 (default) / 30 秒 / 不上锁. Once the 账号 page is open, it locks again
    after that many seconds **without activity** (mouse, keys, wheel, touch anywhere in the window reset the count);
    a text field being typed into on the 账号 page holds it off, so a pause never throws away an edit. "Locks" means
    going back to whichever gate the page has: the 账号页密码 screen (full or mini window) or, without a password, the
    slide frost (full window only, D-051). With neither, there is nothing to lock and the row says so.
  - **不上锁 asks first** in a small card like 删除确认 (「不再自动上锁？」, 取消 focused, 确认不上锁); 取消 or Escape keep the
    old choice. The other choices apply at once.
- Storage: browser-storage preference `clipbox.account-auto-lock.v1` ("10", "20", "30" or "0"; anything else = 20),
  read and written through `readStoredChoice` / `writeStoredChoice` (`app/account-auto-lock.ts`). Not in the vault, not
  in backups; nothing in the encryption, the vault or the 账号页密码 changes.
- Both Windows and Mac. Tests: `tests/account-auto-lock.test.mjs`, `tests/e2e/account-auto-lock.e2e.mjs`. The shared
  e2e storage state starts with auto-lock off so slow steps in other tests are not locked out.
