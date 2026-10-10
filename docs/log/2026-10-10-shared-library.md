# Shared 话术 library

- Date: 2026-10-10 · Thread/agent: 【話術】話術功能與測試版
- What changed: Settings → 共享话术 syncs a company JSON file (address or file) per stable id: new entries added, untouched ones updated, employee-edited ones keep their text and show 「公司版有更新」 with a compare and 保留我的 / 用公司版, dropped ones only marked 「公司已停用」; nothing is deleted or overwritten. With an address set it also syncs once at start. Storage: optional `shared` field on items and optional `sharedSeen` list in the vault (same encrypted save, kept in backups). Decision D-026; format in `docs/shared-library.md`.
- User-visible change (plain Chinese, for the preview changelog): 设置里新增「共享话术」：同步公司话术，只新增和更新没改过的，你改过的保留并提示「公司版有更新」，公司停用的只做标记，不会删除或覆盖你的话术。
- Not done / risks: needs the owner's 合并 (storage change); nobody has hosted a file yet; 公司版有更新 only compares the English text; the web version needs an address that allows cross-site reads.
- Next step: owner says 合并 #61, then picks where the file is hosted.
