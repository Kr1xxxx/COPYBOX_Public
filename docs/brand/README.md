# COPYBOXX 品牌文件

图标：按老板给的 1024px 原图描成矢量——深色渐变圆角方块，白色侧着的 U（既是 COPYBOXX 的 C，也是一个开口的盒子），
开口里一块略微倾斜的紫色小卡片（复制出来的那一条，上面一道文字线）。文字 logo「COPYBOXX」是新设计。所有 SVG 都已转成轮廓，不依赖字体。

## 文件

| 文件 | 用途 |
| --- | --- |
| `icon.svg` | 应用图标源文件（1024，方块外透明）。`src-tauri/icons/` 里的 png / ico / icns 由它导出 |
| `icon-mark.svg` | 同一个图标，画布紧贴方块（928），放在文字旁边或界面里用 |
| `wordmark.svg` / `wordmark-dark.svg` | 文字 logo「COPYBOXX」，最后一个 X 用紫色（浅色底 / 深色底） |
| `wordmark-mono.svg` / `wordmark-mono-dark.svg` | 单色版，印刷、水印用 |
| `wordmark-cn.svg` / `wordmark-cn-dark.svg` | 「COPYBOXX 复制盒」一行，页眉、关于页用 |
| `lockup-horizontal.svg` / `-dark.svg` | 图标 + COPYBOXX ｜ 复制盒，横排，官网页眉、文档页眉用 |
| `lockup-stacked.svg` / `-dark.svg` | 图标在上、文字在下，启动页、分享图、海报用 |
| `preview.png` | 以上全部的总览图 |

## 设计说明

- 字体：Latin 用 Inter Display SemiBold 全大写，字距 +2%；中文用 Noto Sans SC Medium。文字已转轮廓，改字要重新生成。
- 颜色：墨色 `#1f1e1c`（深色底 `#f1efe7`）；强调色取图标紫卡片的两端 `#8f7ff6`（浅色底）/ `#c4b9ff`（深色底）；中文用次要色 `#55534d` / `#b3b0a4`。
- 「COPYBOXX」里只有最后一个 X 变色：两个 X 是名字的记忆点，变色让它看起来是故意的，并和图标里的紫卡片呼应。
- 图标（1024 画布）：方块 48–976、圆角 230，渐变 `#2d2b33`→`#16151b`，边上一圈 7% 白色细线；C 线宽 108、端头圆，外圆角 214；
  紫卡片 176×156、圆角 40、逆时针转 6°，渐变 `#c4b9ff`→`#8f7ff6`，文字线 88×20。
- 相对原图的优化：改成矢量（任何尺寸都清晰）；紫卡片的中心对齐到 C 的中线；圆角、倾斜角度取整；方块加了一圈极淡的边线，
  在深色桌面上不会糊成一块；方块外透明，不再有米色底块（Mac/Windows 都自己加底）。
- 留白：文字 logo 四周至少留一个「X」的宽度；横排版图标高度不小于 24px。

## 重新生成

```bash
pip install fonttools uharfbuzz pillow
python3 tools/brand/build-logo.py --inter <InterDisplay-SemiBold.otf> --noto <NotoSansSC-Medium.ttf>
# 用浏览器把 docs/brand/icon.svg 渲染成 1024×1024 透明 PNG，然后：
python3 tools/brand/export-icons.py icon-1024.png
```

字体不入库：Inter 见 rsms.me/inter，Noto Sans SC 见 fonts.google.com/noto。
