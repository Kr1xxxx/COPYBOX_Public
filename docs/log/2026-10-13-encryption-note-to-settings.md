# Encryption note moves from the empty 话术 page to 设置

- Date: 2026-10-13 · Thread/agent: coordinator (owner's request, 2026-10-13: 「内容用 AES-256加密，只保存在这台设备上 这句话删掉,放到设置里」)
- What changed: The line 「内容用 AES-256 加密，只保存在这台设备上」 no longer shows under the first-run 话术 page (`app/list-empty-state.tsx`). The same sentence now stands in 设置 → 数据, replacing the older note 「所有内容加密后只保存在这台电脑上，不会上传。」 (`app/settings.tsx`); the settings e2e expectation follows the new wording. That test also banned the word "AES" from the settings dialog ("no jargon in the security note"); the owner asked for this sentence word for word, so the test now bans only "PBKDF2". Not a loosening to get green: the owner's wording wins over the older rule.
- User-visible change (plain Chinese, for the preview changelog): 空话术页上的「内容用 AES-256 加密，只保存在这台设备上」移到了 设置 → 数据
- Not done / risks: 无
- Next step: 无
