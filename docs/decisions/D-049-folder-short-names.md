### D-049 Own folders can have a short name for the mini window, set behind 「⋯」 in 设置 → 目录 (2026-10-14)
- Context (owner, 2026-10-14): 「自建目录自己设简称 ,放到设置目录页的设置里,尽量隐蔽一些,需要点开单独设置,否则默认是两位」.
  The mini window's folder tabs show two characters (`folderShortName` in `app/folder-short-name.ts`, 2026-10-13):
  the seven standard 话术 folders have fixed ones, every other folder shows its first two characters.
- Decision:
  - **Only own folders** get a short name: 话术 folders the person made, 账号 folders (macOS, where they are shown) and
    图片 folders. The standard 话术 folders and 未分类 keep theirs; they have no 「⋯」.
  - **Hidden behind a click.** Each own folder row in 设置 → 目录 ends with a quiet 「⋯」 (更多设置). It opens a small
    panel under the row, like the colour dots: 「迷你窗口显示为」, a short box (its placeholder is the default, e.g. 客户),
    保存, 恢复默认 and 取消. Esc closes only the panel. One panel (colour or ⋯) is open at a time.
  - **What counts as short:** trimmed; empty means "use the default"; otherwise at most two characters (an emoji counts
    as one), or up to four Latin letters/digits — the same rule the default uses, so a saved short name always shows
    whole. Anything longer is refused with 「最多两个字」; nothing is ever cut silently.
  - The tab's tooltip and accessible name stay the full folder name.
- Storage (additive, optional; no storage key changes, no migration):
  - **话术 / 账号:** a new optional field in the encrypted vault (`clipbox.vault.v1`):
    `folderShortNames?: { snippet?: { [folder]: shortName }, secret?: { [folder]: shortName } }`, next to
    `folderColors`. `normalizeVaultData` keeps an entry only for an existing, non-standard folder with a valid short
    name; a kind without entries is left out, and the whole field is left out when there are none, so a vault without
    short names is saved byte for byte as before. Renaming a folder moves its short name; deleting a folder drops it.
    It goes through every save path (immediate, delayed, command line) and the 话术 / 账号 encrypted backups
    (`vaultDataForBackupScope`); importing merges like the colours (what is already here wins) and replacing one kind
    keeps the other kind's short names.
  - **图片:** the image folder record (`clipbox-images`, encrypted `folders` row) gets an optional `shortName` on the
    folder, `{ name, color?, shortName? }`, set with `setFolderShortName(name, shortName | null)`. Renaming keeps it,
    deleting the folder drops it. An invalid stored value is ignored when read.
  - **Full backups** (`data-transfer.ts`, automatic backups) copy the stored records as they are, so the short names
    travel with them without any change.
- Older app versions: they read a vault or image store that has the new fields without any error. An older version
  rebuilds the vault without `folderShortNames` on its next save, so only the 话术 / 账号 short names are lost (the
  folders and everything else stay). Image folders keep `shortName` even in an older version, because it copies the
  folder record as a whole when it renames or recolours. Old backups (without the field) import as before.
- Why this needs the owner's 合并: it adds a field to the encrypted vault and to the image store.
