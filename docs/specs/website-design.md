# copyboxx.com — website design spec (2026-10-13)

Owner request: a complete, normal product website (icons, share card, several pages, search-engine files), in the
style of cardart.cc (owner's screenshots: Apple-style light theme, lots of air, huge bold headline, black pill
button, blue text links with →, numbered steps with hairlines, a big rounded grey panel holding the product mock,
small bordered requirement cards, a row of cards under a section title with a "更多 →" link on the right).
Hosting stays as in D-045 (Worker + KV, `tools/website/`). Product name: Clipboxx / 复制盒 (D-044). All visible
text is plain Chinese; no English eyebrow labels, no badges, no emoji, no filler.

## Tokens (`tools/website/site.css`, CSS variables on `:root`)

| Token | Light | Dark (`prefers-color-scheme: dark` and `:root[data-theme="dark"]`; `[data-theme="light"]` forces light) |
| --- | --- | --- |
| `--page` | `#f7f8fa` | `#0f1115` |
| `--panel` (big rounded grey panels) | `#eef0f4` | `#171a20` |
| `--card` | `#ffffff` | `#1c2027` |
| `--ink` / `--ink-2` / `--muted` | `#111318` / `#3b3f47` / `#6b7280` | `#e8e9ec` / `#c3c7cf` / `#9aa0ab` |
| `--hairline` / `--border` | `#e5e7eb` / `#e1e4ea` | `#272b33` / `#2d323b` |
| `--accent` (links, eyebrow dot, focus ring; from the app icon's lock) | `#6f67c9` | `#a39cf0` |
| `--accent-tint` (soft lavender fills, glyph backgrounds) | `#e9e6fb` | `#2a2750` |
| `--primary` / `--primary-ink` (the pill button) | `#111318` / `#ffffff` | `#f5f6f8` / `#111318` |
| `--primary-hover` | `#2a2d34` | `#e2e4ea` |
| `--shadow-card` | `0 1px 2px rgba(16,18,24,.04), 0 12px 40px rgba(16,18,24,.08)` | `0 1px 2px rgba(0,0,0,.4), 0 12px 40px rgba(0,0,0,.5)` |
| `--shadow-float` (hero cards) | `0 30px 80px rgba(16,18,24,.18)` | `0 30px 80px rgba(0,0,0,.6)` |

- Radius: panels 24px, cards 16px, small 12px, pills 999px. Hairlines 1px.
- Type: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", "Microsoft YaHei", "Noto Sans SC", sans-serif`.
  h1 `clamp(36px, 6vw, 64px)` weight 700, letter-spacing -0.02em, line-height 1.1; h2 28px (32px desktop) weight 700,
  -0.01em; h3 18px weight 600; body 16px/1.7 (15px on phones); muted lead 18px; small 13px; numbers tabular.
- Spacing: 8px scale; section padding 96px (desktop) / 56px (phone); container max-width 1120px, gutters 24px (16px phone).
- Motion: 150ms ease on buttons and links; the hero visual fades up 400ms on load; nothing else; all off under
  `prefers-reduced-motion`.
- Theme toggle in the header: cycles 跟随系统 → 浅色 → 深色, stored in `localStorage` key `clipboxx-site-theme`,
  applied as `data-theme` on `<html>` by a few lines of inline script in `<head>` (before paint) — the only JavaScript
  on the site besides the FAQ `<details>` which needs none.

## Layout patterns

1. **Header** (sticky, `--page` at 85% with backdrop blur, hairline bottom): left the mark (`/favicon.svg`, 24px) +
   `Clipboxx` (700) + `复制盒` (muted); nav 首页 · 下载 · 使用说明 (muted, current page in `--ink`); right:
   theme toggle (icon button, `aria-label`), text link 在线试用, primary pill 下载 Windows 版. On phones the nav wraps
   under the brand in a second row; no hamburger.
2. **Hero** (home): two columns (text / visual), stacked on phones. Eyebrow `● v__VERSION__ · __UPDATED__ 更新`
   (accent dot). h1 over two lines 「常用话术、账号资料、图片，一键复制」. Lead 「装在自己电脑上，不用注册、不用联网就能用。
   内容用 AES-256 加密，只保存在这台设备上。」(fixed line). CTAs: primary pill 「下载 Windows 版 →」 + text links
   「使用说明」「在线试用」. Visual: three fanned cards drawn in HTML/CSS (rotations about -8°, 0°, +6°, overlapping,
   `--shadow-float`, on a soft white radial glow): a 话术 card (a title, two lines of sample reply text, a small
   「复制」 chip), an 账号 card (a site name, masked dots, 「复制」 chip), an 图片 card (a lavender gradient tile with a
   tiny caption). No carousel.
3. **Card row** (like 推荐作者): section title left, `更多 →` link right; white cards, 1px `--border`, 16px radius, an
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
`theme-color` (light `#f7f8fa`, dark `#0f1115`), icons, Open Graph + Twitter card with `/og-image.png`, manifest)

| Path | Title | Content |
| --- | --- | --- |
| `/` | `Clipboxx · 复制盒` | hero; 三个部分 card row (话术 / 账号 / 图片, texts as on the current page); 三步装好 steps (下载安装包 / 双击运行，看到「未知发布者」点「更多信息」→「仍要运行」 / 用过旧版的话先在旧版「设置 → 数据 → 导出到新版」，再在新版「从旧版导入」) beside the app image; 系统要求 cards (Windows 10 / 11，64 位；Mac（Apple 芯片）暂不提供下载；网页测试版：任意浏览器，需要口令); 用起来顺手 feature grid (托盘小窗 / 搜索 / 备份 / AI 润色和整理 / 公司共享话术 / 主题); 常见问题 (5 questions, see /help/); footer |
| `/download/` | `下载 · Clipboxx` | one big download card: Windows 版 v__VERSION__ · __SIZE__ · 更新于 __UPDATED__, primary pill 下载, a muted line with the SHA-256 (`__SHA256__`, wrapped, tabular); 安装步骤 (numbered, as above); 安装时的提示 (SmartScreen); 从旧版搬数据; 更新方法 (回到这里下载新版本，直接覆盖安装，数据不会丢); Mac 版 note |
| `/help/` | `使用说明 · Clipboxx` | a short overview (owner, 2026-10-13: 「现在写的太细了」): one intro line, the in-page list of pills at the top, then eight sections, each an `h2` and two or three plain sentences, no `h3` and no step lists: 话术, 账号, 图片, 托盘小窗, 备份与恢复, 公司共享话术, AI 润色和整理, 设置; then 常见问题 (数据存在哪里 / 忘了账号密码怎么办 / 换电脑怎么搬 / 为什么 Windows 提示未知发布者 / 和旧版 Clipbox 是什么关系) as `<details>`. Only say what the app really does: check `README.md`, `docs/features.json` and the labels in `app/settings.tsx`, `app/page.tsx`; when unsure, leave it out |
| `/privacy/` | `隐私说明 · Clipboxx` | short: no account, no server, data encrypted on the device; the website collects nothing and sets no analytics; the web preview keeps its data in the visitor's browser; the passphrase cookie is the only cookie |
| `404.html` | `找不到这个页面 · Clipboxx` | same header/footer, short text, link home |
| `preview-gate.html` | `网页测试版 · Clipboxx` | same look (card on `--page`), unchanged behaviour |

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
  icons 192/512, theme/background colours), `robots.txt` (`User-agent: *`, `Disallow: /preview/`, `Sitemap:`), and
  `sitemap.xml` (the four pages, `lastmod` = the update date). Output keys: `index.html`, `download/index.html`,
  `help/index.html`, `privacy/index.html`, `404.html`, `preview-gate.html`, `assets/...`,
  `images/...`, root icon files, `download/Clipboxx-Setup.exe`, `download/latest.json`, `preview/**`.
- Worker: content types for ico, txt, xml, webmanifest, jpg, webp; `assets/` (any depth) immutable; `images/` and the
  root icon files one day with ETag.
