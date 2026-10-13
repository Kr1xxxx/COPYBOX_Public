### D-042 A recovery code is never lost unseen, and the pre-migration copy deletes itself (2026-10-13)
- Context: two gaps in D-040 (review 2026-10-13, items 4a and 4b). (a) The recovery code was stored (wrapped) before the
  migration but shown only after it; quitting in between, or closing 设置 (×, backdrop, Esc) while the code was on screen,
  left a code the user never saw. Only 「完成」 checked the tick. (b) `clipbox.account-premigration.v1` keeps the 账号 stores as
  they were before encrypting, still under the device key that sits next to it, so anyone with the data folder could read the old
  账号 data. D-040 kept it "until the owner deletes it".
- Decision (owner, 2026-10-13, "照做"):
  - (a) The version 2 record in `clipbox.account-lock.v1` gets an optional field `codeShown`. It is written `false` with every new
    code (setting / upgrading the password, 新恢复码) and set to `true` only when the user ticks 「我已经把恢复码保存好了」 and
    presses 完成. A record without the field (everyone before this change) counts as saved: no migration. Using the recovery code
    to reset the password also sets it to `true` (whoever typed it has it). 修改密码 and the 找回邮箱 keep the field as it is.
    At the next unlock with the password while it is `false`, a **new** code replaces the old one (the old one is not stored in
    plain text and stops working, exactly like 新恢复码) and is shown on the lock screen with the same tick and 完成 before the page
    opens. An interrupted set-up is first finished (`finishAccountMigration`), then the new code is shown. Version 1 (door-only)
    records have no code and are unchanged.
  - Closing 设置 while a code is on screen and not confirmed asks first: 「恢复码还没保存，确定关闭吗？」 with 回去保存 (default) and
    仍然关闭. Asking rather than blocking: someone who already copied the code but forgot the tick can still leave, and nothing is
    lost because the next unlock gives a new code anyway.
  - (b) The copy is deleted by itself once the 账号 page opened with K (the password or the recovery code) in **three later app
    sessions**: one page load counts at most once, and the session that made the copy never counts. A session only counts when the
    lock is version 2 with the migration finished (`phase: "ready"`) and the vault items and 验证码 just read fine with K;
    otherwise nothing is counted or deleted. The count lives inside the copy itself (`session`: the page load that made it,
    `unlocks`: the later page loads that counted), so it goes away with the copy and needs no new storage key. A copy from before
    this change has no `session` and counts every session as a later one. A damaged copy is left alone. The 删除备份… button stays;
    the 设置 text says it is deleted automatically.
- Supersedes: D-040's "The backup stays until the owner deletes it in 设置".
- Consequences: no storage key or encryption format changes; two record fields are added (`codeShown` in the lock record,
  `session` / `unlocks` in the pre-migration copy) and older records without them keep working. The device-key copy of the old
  账号 data now lives for a few app starts instead of forever. A crash after a new code was made but before it was confirmed simply
  gives yet another code at the next unlock.
- Status: Accepted (owner approved 2026-10-13).
