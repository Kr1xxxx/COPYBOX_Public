### D-102 「稍后」 skips once, an old running copy is named, backups are called copyboxx-… (2026-10-20)
- Context: desktop audit item I (old 25, 20, 21), picked by Krix 2026-10-20. 「稍后」 on the update banner hid that
  version for good; an older Clipboxx still running in the tray took over every launch of Copyboxx through the shared
  single-instance lock (D-046), so the new app looked broken; backup files were still named clipbox-….
- Decision:
  - 「稍后」 (like 「知道了」) hides the banner until the next check: the next launch, or the daily re-check. The old
    forever-skip key `clipbox.update-dismissed` is no longer read and is removed on launch.
  - Windows: before the single-instance lock, the app looks for another `clipbox.exe` (exact case) running from a
    different file. If there is one, it shows a message to quit the old one from the tray first, then exits
    (`src-tauri/src/old_copy.rs`). It does not close the old app itself: that could lose what the old one has not saved.
  - New file names: `copyboxx-full-backup-…`, `copyboxx-snippets-…`, `copyboxx-secrets-…`, `copyboxx-company-library-…`
    and daily `copyboxx-auto-YYYY-MM-DD.json`. Restoring reads the file's content, so old names still restore; the
    daily-backup list, restore and clean-up accept both `clipbox-auto-…` and `copyboxx-auto-…`. File formats and
    storage keys are unchanged.
