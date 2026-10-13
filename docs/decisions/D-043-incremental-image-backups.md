### D-043 Automatic backups keep each picture once; thumbnails and the pre-migration copy stay out; failures are shown (2026-10-13)
- Context: the daily automatic backup (D-039) wrote one file holding everything, pictures included as base64, and kept
  seven: seven full copies of every picture on disk, a main-thread freeze of several seconds with a few hundred MB of
  pictures, and above about 384 MB `JSON.stringify` fails outright. A failure was silent (only 「最近一份」 got older). Every
  backup, automatic and 完整备份, also carried `clipbox.account-premigration.v1` (the 账号 data from before D-040, encrypted
  with the device key only), which in the unencrypted automatic file sits next to `clipbox.device-key.v1` and undoes D-040.
- Decision (owner, 2026-10-13: 「图片只备份新增和变化的，并在备份失败时在设置里提示」, leaving the pre-migration copy out, 「照做」):
  - **Pictures once (desktop)**: each picture record's bytes are a file `backups/images/<sha-256 hex>.bin` (64 lowercase hex
    digits; Rust checks the shape, nothing outside that folder, at most 64 MiB a file). The day file
    `clipbox-auto-YYYY-MM-DD.json` becomes format version 2: `{ format: "clipbox-auto-backup", version: 2, savedAt, imageBytes,
    payload }`, where the payload is the settings plus the picture database with every byte run replaced by
    `{ "$ref": "<sha-256>.bin", "size": n }`. A day writes only picture files that are not there yet. After the day file is
    written and the days are pruned to seven, picture files no kept day points at are removed (if any day file cannot be
    read, nothing is removed). Restore reads each referenced file and checks its size and SHA-256 before anything is replaced.
  - **Old files keep working**: version 1 files (pictures inside, every file before this decision) restore as before. The
    browser trial keeps writing version 1 (no picture files there). A version 2 file is refused by older app versions
    instead of being half-restored.
  - **No long freeze**: the picture database is read a few records at a time with a pause in between, each picture is sent
    to the shell as its own write, and no single giant string is built. The copy of the current data kept during a restore
    is stored as an object, not one JSON string.
  - **Thumbnails out**: `clipbox-image-thumbs` is not in automatic backups; a restore clears it and the app makes the
    thumbnails again when pictures are shown. The 完整备份 file format does not change (it still carries thumbnails; files
    with or without them restore).
  - **Pre-migration copy out of all backups** (amends D-039/D-040): `clipbox.account-premigration.v1` is never collected into
    a 完整备份 or automatic backup; when an older file still carries it, it is dropped on restore; a restore leaves this
    device's own copy as it is (it is still deleted from 设置 as D-040 says).
  - **Failure notice**: a failed automatic backup is remembered in `clipbox.auto-backup.last-error` (`{ at, reason }`,
    reason "space" when disk, storage or size limits ran out) and shown under 「每天自动备份」 in 设置 → 数据, e.g.
    「最近一次自动备份没有成功（10月13日）。会自动再试，也可以用「完整备份」手动存一份。」; the next successful backup removes it.
    The key is kept on this device only, like the pre-migration copy (never in a backup, untouched by a restore).
- Consequences: daily backups cost only the settings and the new pictures; the backups folder holds each picture once.
  New pref key `clipbox.auto-backup.last-error`; four new desktop commands (`backup_image_save/list/read/prune`); no change to
  how stored data is encrypted. An app older than this decision cannot restore a version 2 file (it says it is not a
  Clipbox backup); the 完整备份 file stays the way to move data to another version.
- Status: Accepted (owner approved 2026-10-13, 「照做」).
