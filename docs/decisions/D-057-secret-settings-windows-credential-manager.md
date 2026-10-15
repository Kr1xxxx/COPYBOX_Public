### D-057 Windows keeps the own TinyPNG keys and the 企业同步码 in Credential Manager (2026-10-15)
- Context: the two TinyPNG keys an employee types in 设置 → 数据 → 图片压缩 (`clipbox.tinify.key.v1`,
  `clipbox.tinify.key2.v1`) and the 企业同步码 / company library address (`clipbox.shared-library-url`) sat in plain
  text in the page's storage, so a copied data folder or a daily automatic backup showed them (audit 2026-10-14, A7).
- Decision (owner picked audit item B, 2026-10-15): on the Windows desktop app these three values live in Windows
  Credential Manager (DPAPI, this Windows user only), through the `keyring` crate already used for the AI key and the
  device key (`src-tauri/src/secret_store.rs`, `app/secret-settings.ts`). The shell only accepts these three names.
  The page reads them once on start into memory, so compression and sync are as fast as before, and the fields in 设置
  look and work the same.
- Moving never loses a value: a new value is written to the page's storage first and that copy is removed only after
  Credential Manager stored it and gave the same value back. If Credential Manager refuses or cannot be read, the copy in
  the page's storage stays and is used. A plain copy found on start is treated as the newest value (written by an older
  app, a failed move or a restored backup) and moved then. A removal Credential Manager refused leaves an empty copy, so
  the old value cannot come back on the next start.
- Backups: the password-sealed 完整备份 carries the three values (restored, they are moved on the next start). Daily
  automatic backups (no password) no longer contain them.
- macOS and the browser trial keep the page's storage for now: the browser has no credential store, and an unsigned Mac
  app can lose its Keychain items after an update (D-012, D-053). A Mac move can follow once that is tried on a real Mac.
- Consequences: if Windows loses the credential (administrator password reset, rebuilt profile), the employee types the
  key or 同步码 again; no 话术, 图片 or 账号 data depends on them. Restoring a backup that has no key keeps the key already
  in Credential Manager.
- Status: Accepted (owner, 2026-10-15, 「可以 那安排下去」 on audit item B). Storage path change: the PR waits for 合并.
