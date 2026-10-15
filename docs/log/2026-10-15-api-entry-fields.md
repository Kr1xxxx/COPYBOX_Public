# API entries: several hidden fields and a 备注

- Date: 2026-10-15 · Thread/agent: 功能 · API 条目多保密字段
- What changed: API entries in 账号 hold any number (≤10) of named hidden fields (Key, Secret, Client ID…) plus a plain 备注
  (D-061). Old entries read their key as the first field, no migration. The command line can read one field by name
  (`clipbox secret get clipbox://apikey/<id> --field "Client ID"`). Mac only: Windows still has no API 密钥 category (owner chose 「只给 Mac」).
- User-visible change (plain Chinese, for the preview changelog): API 密钥可以存多项保密内容（Key、Secret、Client ID 等，各自隐藏）和备注（Mac 版）。
- Not done / risks: not tried on a real Windows PC or Mac.
- Next step: the notes thread's 「转为登录/API」 can write `fields` / `note` (see D-061).
