### D-040 The 账号页密码 now really encrypts the 账号 data (2026-10-12)
- Context: D-038 made the password only a door; the data stayed encrypted with the device key kept on the same computer, so
  someone with the data folder could read it (advisor review 2026-10-12, item 2). The owner chose to fix it ("124568 安排").
- Decision (owner): setting a password encrypts the three 账号 stores (`clipbox.vault-items.v1`, `clipbox.totp.v1`,
  `clipbox.site-icons.v1`) with a random key K instead of the device key. The storage format of those stores does not change
  (same AES-GCM envelopes, the passphrase is just K). `clipbox.account-lock.v1` becomes a version 2 record holding K twice, wrapped
  (AES-GCM, PBKDF2 210k): once by the password, once by a **recovery code** (20 characters, shown once when the password is set).
  The password must be at least 8 characters now.
  - **Forgetting the password never loses data**: the recovery code opens the data and sets a new password (忘记密码 → 用恢复码重设密码).
    Password and code both lost = the data cannot be opened; this is stated where the code is shown. The email reset (D-038) is still
    waiting for the server and does not touch the data.
  - **Migration is safe**: before anything changes, all three stores are read with the device key (if that fails nothing is
    touched), a raw copy is kept in `clipbox.account-premigration.v1`, the data is written under K and read back and compared; on
    any failure the stores and the old lock record are restored exactly. An interrupted change is finished at the next unlock (each
    store is read with K, or else the device key, and written under K). The backup stays until the owner deletes it in 设置
    (it is still device-key encrypted, so it should be deleted once everything is confirmed).
  - 关闭密码 (needs the password) moves the data back under the device key. 修改 only rewraps K (no re-encryption). 新恢复码 replaces the old code.
  - An old door-only password (version 1) keeps working; 设置 offers 「加密…」 to upgrade it (needs the old password and an 8+ character new one).
  - Not covered: on Mac the old 秘密 list (「其他」) lives in the main vault under the device key; the 找回邮箱 is stored in plain text.
  - The key K exists in memory only while the 账号 section is open; leaving the section locks again.
- Supersedes: the "password is only a door" lines of D-038. Backups (账号备份) are unchanged: they have their own password.
- 完整备份 (PR #98) copies every `clipbox.*` key as it is, so it carries the lock record (K wrapped twice) and the encrypted stores: a
  restored backup still needs the password or the recovery code. The recovery code is deliberately NOT written into any backup:
  with it in the file, the backup password would become a second way in. Keep the code on paper or in a password manager.
- Trade-off the owner accepted by choosing real encryption: security against someone holding the data folder, paid for with "password
  and recovery code both lost = unreadable data". The planned email reset (server never sees the password) can prove identity but
  cannot recover encrypted data, so the recovery code is the only way back.
