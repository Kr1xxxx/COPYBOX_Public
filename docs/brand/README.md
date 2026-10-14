# Copyboxx 品牌文件

图标：按老板给的 1024px 原图描成矢量——深色渐变圆角方块，白色侧着的 U（既是 Copyboxx 的 C，也是一个开口的盒子），
开口里一块略微倾斜的紫色小卡片（复制出来的那一条，上面一道文字线）。文字 logo 单独成立、不依赖图标，走互联网主流审美：「Copyboxx」Inter Display Bold，「复制盒」MiSans Bold，
中文和英文大写等高。所有 SVG 都已转成轮廓，不依赖字体。

## 文件

| 文件 | 用途 |
| --- | --- |
| `icon.svg` | 应用图标源文件（1024，方块在 100–924，方块外透明）。`src-tauri/icons/icon.svg` 是它的副本，`node scripts/render-icons.mjs` 由此生成 png / ico / icns 和安装包图片；`icon-16.svg`、`icon-24.svg`、网站 `favicon.svg` 是按像素网格手画的小尺寸版 |
| `icon-mark.svg` | 同一个图标，画布紧贴方块（928），放在文字旁边或界面里用 |
| `icon-mono.svg` / `icon-mono-white.svg` | 单色应用图标：方块里把 C 和卡片镂空。单色印刷、系统着色图标、水印用 |
| `symbol.svg` | 只有 C 和卡片、没有方块的标志，浅色底上用（深灰 C + 紫卡片） |
| `symbol-black.svg` / `symbol-white.svg` | 单色标志，纯黑 / 纯白。刺绣、激光刻、单色印刷、头像用 |
| `wordmark.svg` / `wordmark-dark.svg` | 文字 logo「Copyboxx」，纯黑（浅色底）/ 纯白（深色底） |
| `wordmark-cn.svg` / `wordmark-cn-dark.svg` | 「Copyboxx 复制盒」一行，页眉、关于页用 |
| `lockup-horizontal.svg` / `-dark.svg` | 图标 + Copyboxx ｜ 复制盒，横排，官网页眉、文档页眉用 |
| `lockup-stacked.svg` / `-dark.svg` | 图标在上、文字在下，启动页、分享图、海报用 |
| `preview.png` | 以上全部的总览图 |

## 设计说明

- 字体（老板定稿 2026-10-14）：Latin 用 **Inter Display Bold**「Copyboxx」，字距 −3.5%；中文用 **MiSans Bold**「复制盒」，字距 +5%，
  字号取英文大写高 ÷ 0.962（MiSans 汉字的视觉高度），所以中文和英文大写一样高，中文中线对齐大写中线。文字已转轮廓，改字要重新生成。
- 字体授权：Inter 是 SIL OFL 1.1，可免费商用、可做 logo；MiSans 是小米授权，个人和商业免费，可做 logo，不得修改后再分发。
  苹方（PingFang）只能在苹果设备上显示，不能用在 logo 和 Windows 素材里，所以没用。
- 颜色：文字只用纯黑 `#000000`（深色底上纯白 `#ffffff`），没有第二种颜色；紫色只出现在图标里。卡片上的文字线是镂空的，放在任何底色上都对。
- 图标（1024 画布）：方块 48–976、圆角 230，渐变 `#2d2b33`→`#16151b`，边上一圈 7% 白色细线；C 线宽 108、端头圆，外圆角 214；
  紫卡片 176×156、圆角 40、逆时针转 6°，渐变 `#c4b9ff`→`#8f7ff6`，文字线 88×20。
- 相对原图的优化：改成矢量（任何尺寸都清晰）；紫卡片的中心对齐到 C 的中线；圆角、倾斜角度取整；方块加了一圈极淡的边线，
  在深色桌面上不会糊成一块；方块外透明，不再有米色底块（Mac/Windows 都自己加底）。
- 留白：文字 logo 四周至少留一个「x」的宽度。
- 最小尺寸（按 logo-design 测试表实测）：图标 16px；横排组合高 24px；「Copyboxx 复制盒」高 20px；竖排组合高 48px，再小中文就糊了。
- 单色规则：需要单色时用 `symbol-black` / `symbol-white` 或 `icon-mono`，不要把彩色图标直接压成一种颜色（那样只剩一个黑方块）。

## 测试记录（2026-10-14，logo-design skill）

- `svg_audit`：图标 81/100（扣分项是沿用原图的 5 种颜色和渐变，有意保留）；`symbol-black` 和 `icon-mono` 100/100；文字标 98。
- `preview_sheet`：16/32/48px 像素测试、单色、反白、模糊、镜像、180° 旋转、浏览器标签、应用图标、头像裁切、页眉、名片，
  以及和 Trello、Airtable、Basecamp、Alfresco、Atlassian、Dropbox 同排的货架测试：深色方块加白 C 在一排蓝色标志里能跳出来。
- 发现并修掉的问题：原来只有彩色图标，压成单色后整个方块变成一块黑，看不见 C；现在补了 `symbol-*` 和 `icon-mono*`。
  C 从描边改成填充轮廓，卡片上的文字线改成镂空，图标外观不变（逐像素比对只有 0.2% 像素差异）。
- `logo-forge` 的 `lf_slop` 反俗套检查：全部通过。

## 重新生成

```bash
pip install fonttools uharfbuzz pillow
python3 tools/brand/build-logo.py --inter <InterDisplay-Bold.otf> --noto <MiSans-Bold.ttf>
node scripts/render-icons.mjs          # src-tauri/icons: icon.png / .ico / .icns、安装包图片（用 Playwright 的 Chromium 和 tauri icon）
node tools/website/make-icons.mjs      # 网站 favicon.ico、触摸图标、分享图
# tools/brand/export-icons.py 是旧的导出脚本，没有 Node 环境时可以用它从 1024 PNG 直接写 ico / icns
```

字体不入库：Inter 见 rsms.me/inter，MiSans 见 hyperos.mi.com/font。
