# 账号列表：卡片一样宽，展开时不分网站标题

- Date: 2026-10-20 · Thread/agent: 界面 · 帳號頁 A + B
- What changed: `.acct-row` keeps fixed copy / 「…」 columns so every card has the same width, and old 「其他」 entries (Mac) get a copy button that copies their content. Expanded, the list no longer shows a title line with a count per website; rows follow one after another in the same order. 收起 and 选择 still show the website titles. Advice: `/mnt/project-files/advice/2026-10-20-account-list/` (A + B, not C).
- User-visible change (plain Chinese, for the preview changelog): 账号列表每张卡一样宽，旧「其他」里的条目也能一键复制；展开时不再每个网站一行标题，条目一条接一条，「收起」照旧按网站折叠
- Not done / risks: C (row restyle like 话术) not done, by choice. Rows keep their `<section aria-label>` per website, so tests and screen readers still see the grouping.
- Next step: 无
