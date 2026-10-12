# 话术 list starts folded and remembers the open card

- Date: 2026-10-12 · Thread/agent: 【話術】
- What changed: Lock asked (2026-10-12 06:23) that the 话术 page is folded by default and remembers the card he last opened when he switches page and comes back. `app/page.tsx` now keeps `openId` (only the card id) in localStorage key `clipbox.open-card` (a view preference like `clipbox.values-collapsed`; the vault and its keys are untouched). Nothing open on first launch. The open card is the one whose id matches `openId`; clicking a row, arrow keys and the "fill the blanks first" jump set it, 收起 clears it. While searching, the top result still opens by itself (until 收起), so Enter copies what is shown. The mini window is unchanged.
- User-visible change: 话术页面默认收起;切换页面或重开软件后还是上次展开的那一条;按「收起」清掉。
- Tests: `tests/e2e/collapse-cards.e2e.mjs` rewritten (default folded, 收起 position, memory across page switch and reload, search opens the top result). Two backup tests (`tests/e2e/backup.e2e.mjs`) now click the 公司地址 card open first because the first card is no longer open by default; they test the same things as before.
- Not done / risks: Forks decided by default: remember across restarts (not only page switches); search keeps auto-opening the top result. Not tried on a real device.
- Next step: Lock tries it in the web trial.
