# Remove decorative English labels

- Date: 2026-10-12 · Thread/agent: 【話術】
- What changed: Lock (08:16) asked to drop English eyebrow text such as 「PERMANENT DELETE」 and not to use obviously AI-looking decoration. Swept `app/*.tsx` and `app/globals.css` for uppercase English labels over Chinese titles. Removed three: `PERMANENT DELETE` / `MOVE TO TRASH` above the delete confirmation title, and `LOCAL SPREADSHEET` above 导入话术表格, plus their now-unused CSS. Titles, buttons and layout are otherwise unchanged. Other dialogs (备份, 迁移, 图片, 账号, 设置, 迷你窗口, 空状态) already used Chinese eyebrows or none. Kept as real field names: `API Key`, `Secret`. New `tests/no-english-labels.test.mjs` fails if an uppercase English eyebrow is added again.
- User-visible change: 去掉弹窗标题上方的英文小字,标题和布局不变。
- Tests: unit test above; lint, typecheck, npm test.
- Not done / risks: The empty state still says 「内容用 AES-256 加密」 (a real fact, not decoration); say if it should go too.
- Next step: Lock looks at the web trial.
