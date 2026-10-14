# Own folders get a short name for the mini window

- Date: 2026-10-14 · Thread/agent: W16 (worker)
- What changed: Own 话术 / 账号 / 图片 folders can get a short name for the mini window's folder tabs from a quiet 「⋯」 at the end of the folder row in 设置 → 目录 (D-049). 话术 / 账号 short names live in a new optional vault field `folderShortNames` (left out when empty, moved on rename, dropped on delete, kept by every save path and the encrypted backups); 图片 short names are an optional `shortName` on the image folder record (`setFolderShortName`). A value longer than two characters (or four Latin letters/digits) is refused with 「最多两个字」.
- User-visible change (plain Chinese, for the preview changelog): 自己建的目录可以设简称：设置 → 目录，点目录右边的「⋯」，填「迷你窗口显示为」，迷你窗口的目录标签就显示这个简称；不填就是默认的前两个字，「恢复默认」可以改回来。
- Not done / risks: An older app version drops the 话术 / 账号 short names on its next save (nothing else is lost); image folder short names survive it. 账号 folders (macOS) are covered by unit tests, not by an e2e run. Waits for the owner's 合并 because it adds a field to the vault and to the image store.
- Next step: Owner tries it on Windows (设置 → 目录 → ⋯ on an own folder, then the mini window).
