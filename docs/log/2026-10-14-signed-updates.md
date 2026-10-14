# Signed Windows updates

- Date: 2026-10-14 · Thread/agent: 安全 · 更新簽名
- What changed: The Windows app now installs an update only when `latest.json` carries a minisign signature made with
  the built-in public key for exactly that version, checked over the downloaded bytes (D-053, `minisign-verify`). The
  Tauri workflow signs the installer in a separate `update-signing` environment job on main; the website build checks
  the `.sig` and copies it into `latest.json`. New tool `tools/update-signing.mjs` (keygen / sign / verify).
- User-visible change (plain Chinese, for the preview changelog): 自动更新会先核对官方签名，不是官方发布的安装包不会安装
- Not done / risks: `src-tauri/update-public-key.txt` is still a placeholder until the owner generates the real key;
  the GitHub environment `update-signing` and its two secrets must exist before the next test build is published.
  Not tried on a real Windows machine.
- Next step: owner generates the key; commit the public key; publish a signed test build from main; deploy the site.
