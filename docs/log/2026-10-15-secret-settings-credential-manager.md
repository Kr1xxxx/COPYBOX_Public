# Own TinyPNG keys and 企业同步码 in Windows Credential Manager (audit B)

- Date: 2026-10-15 · Thread/agent: 安全 · 密鑰改存系統憑據庫(審計 B)
- What changed: On Windows the two own TinyPNG keys and the 企业同步码 move out of plain localStorage into Credential Manager
  (`src-tauri/src/secret_store.rs`, `app/secret-settings.ts`, D-057), read once on start into memory; the plain copy is
  removed only after the credential reads back the same value. The 完整备份 carries them; daily backups no longer do.
  macOS and the browser trial are unchanged.
- User-visible change (plain Chinese, for the preview changelog): Windows 版：压缩密钥和企业同步码改存到系统的凭据管理器，不再明文放在数据旁边；填写方式不变。网页测试版无变化。
- Not done / risks: Not tried on a real Windows PC yet (the Windows smoke test has a new step); macOS still keeps them in
  the page's storage (D-012 Keychain risk).
- Next step: run the Windows smoke test on the installer; decide later whether the Mac moves them to the Keychain.
