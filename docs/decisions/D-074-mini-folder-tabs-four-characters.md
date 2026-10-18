### D-074 The mini window's folder tabs show up to four characters (2026-10-17)
- Context (owner, 2026-10-16: 「现在目录仅显示两个字,改成显示四个」; 2026-10-17: 「上次说目录显示 4 个字 为什么还没成功」):
  the only place where folder names showed exactly two characters was the mini window's folder row (D-049,
  `app/folder-short-name.ts`). The 2026-10-16 fix (#218) widened the main window's sidebar instead, which already showed
  four-character names next to a one- or two-digit count, so the owner saw no change.
- Decision (changes the length rule of D-049; everything else in D-049 stays):
  - Folder tabs in the mini window show a folder's first **four** characters (an emoji counts as one), or up to
    **eight** Latin letters/digits. Four-character names such as 询盘接待 or 开场接待 show whole.
  - The seven standard 话术 folders no longer have fixed two-character labels: their names are four characters, so they
    show whole. They still cannot get a short name of their own.
  - A short name the person sets in 设置 → 目录 → 「⋯」 may be up to four characters (eight Latin letters/digits);
    anything longer is refused with 「最多四个字」. The default shown as the placeholder is the first four characters.
- Storage: none changed. Short names saved under D-049 (two characters at most) stay valid. An older app version drops a
  saved short name of three or four characters on its next save (it reads it as invalid), and the folder then shows
  its default label there; nothing else is lost.
