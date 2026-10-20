### D-103 数据 page has one main backup; say 加密 only on 安全; one name 「高亮块」; no text under 12px (2026-10-20)
- Context: desktop audit item J (old 14, 15, 18, 26), picked by Krix 2026-10-20: the 数据 page was too crowded, the
  app said 加密 everywhere, the same thing had three names (高亮 / 变量 / 填空), and much small text was 9–11.5px.
- Decision:
  - 设置 → 数据 is split into cards. 「备份与恢复」: 完整备份 (the only dark main button), 从完整备份恢复, the two
    automatic-backup rows, and a folded 「更多导出和导入」 with 导出话术备份 / 导出账号备份 / 导出账号表格 / 导入账号表格 /
    导入备份. 「导入话术」: 导入话术表格, Tips, test content. 「本机数据」: 重新加载, 数据位置. Settings search opens the fold.
  - 加密 is said on the 安全 page (its one note line stays word for word, owner 2026-10-13) and where a password is
    being set or a file has none. Elsewhere it is 「已保存」 / 「只存在这台电脑上」; the 「本机加密」 tag beside the 账号
    title is gone.
  - The fillable `[ ]` part is called 「高亮块」 everywhere: it is the word the editor buttons (设为高亮 / 取消高亮) and
    the 话术 import spec (「要填的地方（高亮块）」) already use. 「变量」 is left only in the import column name 可替换变量
    (renaming it would break existing spreadsheets) and in the AI prompts, which the user never sees.
  - No visible text under 12px (drawings in the first-run guide and the TOTP ring excepted); the light-theme grey
    `--muted` goes from #6f6d66 to #65635c so it reads at 4.5:1 or better on every light surface.
- Checked by `tests/e2e/readable-text.e2e.mjs`.
