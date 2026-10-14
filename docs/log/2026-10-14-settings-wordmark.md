# Settings page shows the Copyboxx 复制盒 wordmark; D-050 collision fixed

- Date: 2026-10-14 · Thread/agent: 【品牌】設置頁文字 logo
- What changed: The 外观 settings page's brand line is now the real wordmark「Copyboxx 复制盒」(Inter Display Bold + MiSans Bold as outlines, pure black / pure white on dark, 22 px tall) instead of system-font text. `tools/brand/wordmark-to-tsx.mjs` turns `docs/brand/wordmark-cn.svg` into `app/brand-wordmark.tsx`; `tests/brand-wordmark.test.mjs` fails if the two drift. The real text stays underneath, visually hidden, for screen readers. PR #146 (账号 slide-to-unlock) merged after PR #125 and reused decision number D-050, which left `npm test` red on main; its decision is renamed `D-051-account-slide-unlock.md` and its references updated (comments in `app/`, tests, its log note). No other logic changed.
- User-visible change (plain Chinese, for the preview changelog): 设置页顶部换成新的 Copyboxx / 复制盒 文字 logo
- Not done / risks: The wordmark appears only in 设置 › 外观; the 关于 page still says「Copyboxx v…」in system text. Changing the wordmark means re-running `build-logo.py` (needs the fonts, not committed) and then `node tools/brand/wordmark-to-tsx.mjs`.
- Next step: Deploy the website so the new favicon and share card go live; check the Dock/taskbar icon on the next test build.
