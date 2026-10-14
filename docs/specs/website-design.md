# copyboxx.com — website design spec (2026-10-13)

Owner request: a complete, normal product website (icons, share card, several pages, search-engine files), in the
style of cardart.cc (owner's screenshots: Apple-style light theme, lots of air, huge bold headline, black pill
button, blue text links with →, numbered steps with hairlines, a big rounded grey panel holding the product mock,
small bordered requirement cards, a row of cards under a section title with a "更多 →" link on the right).
Hosting stays as in D-045 (Worker + KV, `tools/website/`). Product name: Clipboxx / 复制盒 (D-044). All visible
text is plain Chinese; no English eyebrow labels, no badges, no emoji, no filler.

## Tokens (`tools/website/site.css`, CSS variables on `:root`)

Polish round (owner, 2026-10-13: 「这个网站参考风格，别改成完全一样的，我们的使用方式不一样」): the values below follow
the reference's measured feel (slate ink, quiet 600-weight type, borderless blurred header, small pills, cards that
only lift on hover) while the structure, sections, copy and purple accent stay ours.

| Token | Light | Dark (`prefers-color-scheme: dark` and `:root[data-theme="dark"]`; `[data-theme="light"]` forces light) |
| --- | --- | --- |
| `--page` | `#f8fafc` | `#14171c` |
| `--panel` (big rounded grey panels) | `#f1f3f6` | `#1b1f26` |
| `--card` | `#ffffff` | `#1f242b` |
| `--ink` / `--ink-2` / `--muted` (slate, not black) | `#1f2733` / `#4b5563` / `#6b7280` | `#eef0f3` / `#c5c9d1` / `#9aa0ab` |
| `--hairline` / `--border` | `#eceef2` / `#e3e6eb` | `#262b33` / `#2c323b` |
| `--accent` (links, eyebrow dot, focus ring; from the app icon's lock) | `#6f67c9` | `#a39cf0` |
| `--accent-tint` (soft lavender fills, glyph backgrounds) | `#e9e6fb` | `#2a2750` |
| `--primary` / `--primary-ink` (the pill button) | `#1f2733` / `#ffffff` | `#f5f6f8` / `#1f2733` |
| `--primary-hover` | `#2f3a48` | `#e2e4ea` |
| `--pill-shadow` | `inset 0 1px 0 rgba(255,255,255,.14), 0 1px 2px rgba(31,39,51,.14)` | same inset, `0 1px 2px rgba(0,0,0,.4)` |
| `--shadow-card` (cards on hover) | `0 1px 2px rgba(31,39,51,.06), 0 2px 8px -2px rgba(31,39,51,.06)` | `0 1px 2px rgba(0,0,0,.3), 0 2px 8px -2px rgba(0,0,0,.4)` |
| `--shadow-float` (hero cards, screenshot window) | `0 2px 6px rgba(31,39,51,.05), 0 14px 32px -10px rgba(31,39,51,.18)` | `0 2px 6px rgba(0,0,0,.25), 0 14px 32px -10px rgba(0,0,0,.6)` |
| `--gutter` | `clamp(16px, 4vw, 40px)` | |
| `--ease` | `cubic-bezier(.22, 1, .36, 1)` | |

- Radius: panels 24px, cards 16px, small 12px, pills 9999px. Hairlines 1px.
- Type: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", "Microsoft YaHei", "Noto Sans SC", sans-serif`.
  h1 `clamp(34px, 4.6vw, 54px)` weight 600, letter-spacing -0.01em, line-height 1.12 (32px on phones); page-head h1
  (download, help, privacy) 40px (30px on phones); h2 24px (26px desktop) weight 600, letter-spacing 0; h3 17px weight
  600; body 16px/1.6 (15px on phones); muted lead 17px; small 13px; nav links 14px weight 500 in `--ink-2`, the
  current page `--ink` weight 600; footer 13px; numbers tabular.
- Spacing: 8px scale; section padding 80px (desktop) / 48px (phone); container max-width 1200px, gutters `--gutter`.
- Buttons: pills 36px tall, 14px weight 500, `--pill-shadow`; the hero and download buttons 44px; hover a little
  darker, press `scale(.97)`. Secondary pills (the in-page list on 使用说明) are `--card` with a `--border` line.
- Cards: 1px `--border`, 16px radius, no shadow at rest, `--shadow-card` on hover. Hero cards and the screenshot
  window use `--shadow-float`.
- Motion: 150ms `--ease` on buttons, links, card shadows and the header line; the hero visual fades up 400ms on load;
  nothing else; all off under `prefers-reduced-motion`.
- Theme toggle in the header: cycles 跟随系统 → 浅色 → 深色, stored in `localStorage` key `clipboxx-site-theme`,
  applied as `data-theme` on `<html>` by a few lines of inline script in `<head>` (before paint) — the only JavaScript
  on the site (it also sets the header's `scrolled` class) besides the FAQ `<details>` which needs none.

## Layout patterns

1. **Header** (sticky, 56px, `--page` at 80% with `backdrop-filter: saturate(1.4) blur(12px)`, no bottom border;
   a hairline appears once the page scrolls, set by the same head script as a `scrolled` class on `<html>`): left the
   mark (`/favicon.svg`, 24px) + `Clipboxx` (600) + `复制盒` (muted); nav 首页 · 下载 · 使用说明 (`--ink-2`, current
   page in `--ink`); right: theme toggle (icon button, `aria-label`), primary pill 下载 Windows 版.
   On phones the nav wraps under the brand in a second row; no hamburger.
2. **Hero** (home): two columns (text / visual), stacked on phones. Eyebrow `● v__VERSION__ · __UPDATED__ 更新`
   (accent dot). h1 over two lines 「常用话术、账号资料、图片，一键复制」. Lead 「装在自己电脑上，不用注册，断网也能照常复制。
   内容用 AES-256 加密，只保存在这台设备上。」(fixed line). CTAs: primary pill 「下载 Windows 版 →」 + text links
   「使用说明」. Visual: three fanned cards drawn in HTML/CSS (rotations about -8°, 0°, +6°, overlapping,
   `--shadow-float`, on a soft white radial glow): a 话术 card (a title, two lines of sample reply text, a small
   「复制」 chip), an 账号 card (a site name, masked dots, 「复制」 chip), an 图片 card (a lavender gradient tile with a
   tiny caption). No carousel.
3. **Card row** (like 推荐作者): section title left, `更多 →` link (14px, weight 500) right; white cards, 1px `--border`, 16px radius, shadow only on hover, an
   inline-SVG glyph (24px, stroke 1.5, `--accent`) on a `--accent-tint` rounded square, title, text.
4. **Numbered steps** (01/02/03 muted tabular numbers in a left column, bold titles, muted text, accent links with →,
   hairlines between) next to a big `--panel` rounded box holding the product image inside a small window frame
   (title bar with three dots) with a muted caption under it. Images: `/images/app-win-light.png` and
   `/images/app-win-dark.png` via `<picture>` + `<source media="(prefers-color-scheme: dark)">`; when `data-theme`
   forces a theme, CSS shows the matching one (both `<img>`s present, one hidden).
5. **Requirement cards**: 2 + 1 grid, each with a line icon, bold title, muted sub-line.
6. **Feature grid**: 3 columns (1 on phones): glyph, title, one or two lines.
7. **FAQ**: `<details>` list with hairlines; `<summary>` bold with a chevron; answers muted.
8. **Footer**: three link columns (产品 / 帮助 / 关于) + a bottom line `Clipboxx · v__VERSION__ · 更新于 __UPDATED__ ·
   数据只保存在你的电脑上`.

## Pages (all `lang="zh-CN"`, shared head: charset, viewport, title `<page> · Clipboxx`, description, canonical,
`theme-color` (light `#f8fafc`, dark `#14171c`), icons, Open Graph + Twitter card with `/og-image.png`, manifest)

| Path | Title | Content |
| --- | --- | --- |
| `/` | `Clipboxx · 复制盒` | hero; 三个部分 card row (话术 / 账号 / 图片, texts as on the current page); 三步装好 steps (下载安装包 / 双击运行，看到「未知发布者」点「更多信息」→「仍要运行」 / 用过旧版的话先在旧版「设置 → 数据 → 导出到新版」，再在新版「从旧版导入」) beside the app image; 系统要求 cards (Windows 10 / 11，64 位；Mac（Apple 芯片）暂不提供下载); 用起来顺手 feature grid (托盘小窗 / 搜索 / 备份 / AI 润色和整理 / 公司共享话术 / 主题); 常见问题 (5 questions, see /help/); footer |
| `/download/` | `下载 · Clipboxx` | one big download card: Windows 版 v__VERSION__ · __SIZE__ · 更新于 __UPDATED__, primary pill 下载, a muted line with the SHA-256 (`__SHA256__`, wrapped, tabular); 安装步骤 (numbered, as above); 安装时的提示 (SmartScreen); 从旧版搬数据; 更新方法 (回到这里下载新版本，直接覆盖安装，数据不会丢); Mac 版 note |
| `/help/` | `使用说明 · Clipboxx` | a short overview (owner, 2026-10-13: 「现在写的太细了」): one intro line, the in-page list of pills at the top, then eight sections, each an `h2` and two or three plain sentences, no `h3` and no step lists: 话术, 账号, 图片, 托盘小窗, 备份与恢复, 公司共享话术, AI 润色和整理, 设置; then 常见问题 (数据存在哪里 / 忘了账号密码怎么办 / 换电脑怎么搬 / 为什么 Windows 提示未知发布者 / 和旧版 Clipbox 是什么关系) as `<details>`. Only say what the app really does: check `README.md`, `docs/features.json` and the labels in `app/settings.tsx`, `app/page.tsx`; when unsure, leave it out |
| `/privacy/` | `隐私说明 · Clipboxx` | short: no account, no server, data encrypted on the device; the website collects nothing and sets no analytics; the site sets no cookies |
| `404.html` | `找不到这个页面 · Clipboxx` | same header/footer, short text, link home |

## Files and build

- `tools/website/pages/{index,download,help,privacy}.html` — page bodies with `__PLACEHOLDER__` slots;
  `tools/website/partials/{head,header,footer}.html`; `tools/website/site.css`; `tools/website/icons/` (favicon.ico,
  favicon.svg, apple-touch-icon.png 180, icon-192.png, icon-512.png, og-image.png 1200×630) and
  `tools/website/images/` (app-win-light.png, app-win-dark.png, optionally app-mini-light.png, app-images-light.png)
  are committed assets produced by `make-icons.mjs` and `make-screenshots.mjs` (Playwright; run by hand when the
  icon or the UI changes).
- `build.mjs` assembles each page (head + header with the current nav item marked + body + footer), fills version /
  date / size / sha256, writes `assets/site.<8-hex-of-sha256>.css` and links it, copies `icons/*` to the
  site root and `images/*` to `/images/`, writes `site.webmanifest` (name Clipboxx, short_name Clipboxx, lang zh-CN,
  icons 192/512, theme/background colours), `robots.txt` (`User-agent: *`, `Allow: /`, `Sitemap:`), and
  `sitemap.xml` (the four pages, `lastmod` = the update date). Output keys: `index.html`, `download/index.html`,
  `help/index.html`, `privacy/index.html`, `404.html`, `assets/...`,
  `images/...`, root icon files, `download/Clipboxx-Setup.exe`, `download/latest.json`. The web preview is no longer on the site (owner, 2026-10-14).
- Worker: content types for ico, txt, xml, webmanifest, jpg, webp; `assets/` (any depth) immutable; `images/` and the
  root icon files one day with ETag.
