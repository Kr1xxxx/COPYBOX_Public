# Windows keeps the device key in Credential Manager

- Date: 2026-10-14 · Thread/agent: 安全 · 本機加密、Mac 自動化介面、備份匯入加固 (audit item A3)
- What changed: On the Windows desktop app the vault's device key moves from localStorage into Windows Credential Manager (`src-tauri/src/device_key.rs`, bridge `deviceKeyGet`/`deviceKeySet`, `app/device-key-store.ts`, `openVault`/`readLocalEncryptedVault` in `app/page.tsx`). Same key value, nothing re-encrypted; the local copy goes only after the credential reads back the same value; every candidate key is tried on start. The sealed 完整备份 carries the key (`app/data-move.tsx`); automatic backups no longer do. macOS and the browser are unchanged. D-053 supersedes D-015 for Windows. Unit tests `tests/device-key-store.test.mjs`, e2e `tests/e2e/device-key-windows.e2e.mjs`, a new step in the Windows smoke test.
- User-visible change (plain Chinese, for the preview changelog): Windows 版把本机加密钥匙放进 Windows 凭据管理器，拷走数据文件夹也打不开内容；界面没有变化
- Not done / risks: If Windows loses the credential (admin password reset, rebuilt profile), local data and automatic backups cannot be opened; only a 完整备份 restores them. Automatic backups made before this change still hold the key for up to seven days. Not tried on a real Windows machine except through the CI smoke test.
- Next step: Owner keeps a recent 完整备份 outside the computer.
