### D-061 API entries hold several hidden fields and a 备注 (2026-10-15)
- Context (owner, 2026-10-15: 「API 支持备注和多个保密字段：方便保存 Key、Secret、Client ID 等成组信息」). An API entry had one
  key and an optional Secret, nothing else.
- Decision: an `ApiKeyItem` (store `clipbox.vault-items.v1`, unchanged key and encryption) gains two optional properties:
  - `fields: { id, label, value }[]` — every hidden value in order. The person adds (up to 10), removes and renames them;
    names are unique per entry (any case), not digits only, at most 30 characters. Each is hidden until 按住显示 / 显示.
  - `note` — plain 备注 (≤ 2000 characters), shown as written, not hidden.
  - On save, `key` / `secret` keep repeating the first two values, so an older app version (or an older backup reader)
    still sees the key. Entries saved before have no `fields`; they read as 「密钥」 (+ 「Secret」 when it was filled), so no
    migration runs and old backups import unchanged.
- Command line (Mac/Linux): `secret-get` / `secret-verify` also take `clipbox://apikey/<id>` (「复制引用」 in the entry) and an
  optional `field` (CLI `--field`): the field's name, any case, or its position `1`, `2`…. Without it the first field is used.
  The answer lists the entry's field names and its 备注. Old `clipbox://secret/<id>` calls are unchanged and refuse `field`.
  The same 允许 dialog guards both.
- Windows: unchanged, still no 「API 密钥」 category (D-038). Asked on a card the same day, the owner chose 「只给 Mac」.
- Status: accepted (owner's request, 2026-10-15).
