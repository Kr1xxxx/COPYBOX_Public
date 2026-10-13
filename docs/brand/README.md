# COPYBOXX 品牌文件

图标：深色圆角方块里一个侧着的 U（既是 COPYBOXX 的 C，也是一个开口的盒子），沿用原图标的米色底、深灰块和淡紫色。
文字 logo「COPYBOXX」是新设计。所有 SVG 都已转成轮廓，不依赖字体。

## 文件

| 文件 | 用途 |
| --- | --- |
| `icon.svg` | 应用图标源文件（1024，含米色底块）。`src-tauri/icons/` 里的 png / ico / icns 由它导出 |
| `icon-mark.svg` | 去掉底块的图标，放在文字旁边或界面里用 |
| `icon-dot.svg` | 备选：U 的开口里加一个紫点。没有采用，留着比较 |
| `wordmark.svg` / `wordmark-dark.svg` | 文字 logo「COPYBOXX」，最后一个 X 用紫色（浅色底 / 深色底） |
| `wordmark-mono.svg` / `wordmark-mono-dark.svg` | 单色版，印刷、水印用 |
| `wordmark-cn.svg` / `wordmark-cn-dark.svg` | 「COPYBOXX 复制盒」一行，页眉、关于页用 |
| `lockup-horizontal.svg` / `-dark.svg` | 图标 + COPYBOXX ｜ 复制盒，横排，官网页眉、文档页眉用 |
| `lockup-stacked.svg` / `-dark.svg` | 图标在上、文字在下，启动页、分享图、海报用 |
| `preview.png` | 以上全部的总览图 |

## 设计说明

- 字体：Latin 用 Inter Display SemiBold 全大写，字距 +2%；中文用 Noto Sans SC Medium。文字已转轮廓，改字要重新生成。
- 颜色：墨色 `#1f1e1c`（深色底 `#f1efe7`）；强调色沿用图标的紫 `#776fb6`（深色底用淡紫 `#ddd8ff`）；中文用次要色 `#55534d` / `#b3b0a4`。
- 「COPYBOXX」里只有最后一个 X 变色：两个 X 是名字的记忆点，变色让它看起来是故意的，并和图标的紫呼应。
- 图标：线宽 88/1024，端头圆角；U 的开口朝右，16px 时仍能认出是 C。底块、圆角、颜色与旧图标一致。
- 留白：文字 logo 四周至少留一个「X」的宽度；横排版图标高度不小于 24px。

## 重新生成

```bash
pip install fonttools uharfbuzz pillow
python3 tools/brand/build-logo.py --inter <InterDisplay-SemiBold.otf> --noto <NotoSansSC-Medium.ttf>
# 用浏览器把 docs/brand/icon.svg 渲染成 1024×1024 透明 PNG，然后：
python3 tools/brand/export-icons.py icon-1024.png
```

字体不入库：Inter 见 rsms.me/inter，Noto Sans SC 见 fonts.google.com/noto。
