### D-053 Windows keeps the device key in Credential Manager (2026-10-14)
- Context: the device key that encrypts 话术, 图片 and (without a 账号页密码) 账号 sat next to the data (D-015), so a copied
  data folder could be opened (audit 2026-10-14, A3). D-015 had removed the earlier protection (D-012) because the owner
  feared data that can no longer be opened.
- Decision (owner, 2026-10-14, 「只改 Windows」): on the Windows desktop app the key moves into Windows Credential Manager
  (DPAPI, readable only by this Windows user), through the `keyring` crate already used for the AI key
  (`src-tauri/src/device_key.rs`, `app/device-key-store.ts`). The key value itself does not change and nothing is
  re-encrypted. The copy next to the data is removed only after Credential Manager stored the key and gave the same value
  back; if Credential Manager cannot be read, the copy next to the data is used and kept. On start every key that might
  open the vault is tried (Credential Manager first, then a copy next to the data, e.g. one a restore just wrote); the one
  that opens it is moved. macOS and the browser trial keep the old place (an unsigned Mac app can lose its Keychain item
  after an update, D-012).
- Backups: the password-sealed 完整备份 carries the key (so it opens on a new computer). The daily automatic backups
  (D-039, no password, in the data folder) no longer contain it, because that would put it next to the data again; they
  restore on the same Windows user, where Credential Manager still has the key. Automatic backups written before this
  change still hold the key until they rotate out (seven days).
- Consequences: if Windows loses the credential (an administrator resets the Windows password, the user profile is
  rebuilt or copied to another computer), the local data and the automatic backups cannot be opened; only a 完整备份
  brings them back. A normal password change by the user keeps it. Supersedes D-015 for Windows; D-015 stays for macOS.
- Status: Accepted (owner picked 「只改 Windows」 on 2026-10-14). High-risk: the PR waits for the owner's 合并.
