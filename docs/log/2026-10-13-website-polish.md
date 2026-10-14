# Website polish: no 更新记录 page, shorter 使用说明, lighter type after the reference's measurements

- Date: 2026-10-13 · Thread/agent: coordinator + worker (website polish)
- What changed: Owner feedback after seeing the full site: the 更新记录 page is removed (nav, footer, sitemap; `latest.json` keeps its notes), 使用说明 is a short overview (eight short sections plus 常见问题) instead of a detailed manual, and the look is tuned toward the reference site's feel using its live measurements (semibold instead of bold headings, h1 about 54px, section titles 24px, slate-grey ink, lighter hairlines, borderless blurred 56px header, 36px pills with an inset highlight, softer shadows, 1200px container) while keeping our own structure, sections, copy and purple accent (`docs/specs/website-design.md` updated).
- User-visible change (plain Chinese, for the preview changelog): 无（软件本身没有改动）。网站 copyboxx.com：去掉更新记录页，使用说明改为简短概览，整体字体和间距更轻
- Not done / risks: 无
- Next step: deploy after merge (`npm run build && npm run preview:build && npm run website:build && npm run website:deploy`).
