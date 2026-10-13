# Clipboxx 品牌文件

图标在原版（深色圆角方块里的淡紫色锁）基础上微调；文字 logo 是新设计。所有 SVG 都已转成轮廓，不依赖字体。

## 文件

| 文件 | 用途 |
| --- | --- |
| `icon.svg` | 应用图标源文件（1024，含米色底块）。`src-tauri/icons/` 里的 png / ico / icns 由它导出 |
| `icon-mark.svg` | 去掉底块的图标，放在文字旁边或界面里用 |
| `wordmark.svg` / `wordmark-dark.svg` | 文字 logo「Clipboxx」，最后一个 x 用紫色（浅色底 / 深色底） |
| `wordmark-mono.svg` / `wordmark-mono-dark.svg` | 单色版，印刷、水印用 |
| `wordmark-cn.svg` / `wordmark-cn-dark.svg` | 「Clipboxx 复制盒」一行，设置页顶部、关于页用 |
| `lockup-horizontal.svg` / `-dark.svg` | 图标 + Clipboxx ｜ 复制盒，横排，官网页眉、文档页眉用 |
| `lockup-stacked.svg` / `-dark.svg` | 图标在上、文字在下，启动页、分享图、海报用 |

## 设计说明

- 字体：Latin 用 Inter Display SemiBold，字距 −2.8%；中文用 Noto Sans SC Medium。文字已转轮廓，改字要重新生成。
- 颜色：墨色 `#1f1e1c`（深色底 `#f1efe7`）；强调色沿用图标的紫 `#776fb6`（深色底用淡紫 `#ddd8ff`）；中文用次要色 `#55534d` / `#b3b0a4`。
- 「Clipboxx」里只有最后一个 x 变色：两个 x 是名字的记忆点，变色让它看起来是故意的，并和图标锁孔的紫呼应。
- 图标改动（对比旧版）：锁整体上移 5px，上下留白从 37/26 变为 32/31，锁孔条从 24px 加宽到 28px（16px 时还看得见），深色底块的灰改为和界面墨色一致的 `#232325`。形状、颜色、比例都不变。
- 留白：文字 logo 四周至少留一个「x」的宽度；横排版图标高度不小于 24px。

## 重新生成

```bash
pip install fonttools uharfbuzz pillow
python3 tools/brand/build-logo.py --inter <InterDisplay-SemiBold.otf> --noto <NotoSansSC-Medium.ttf>
# 用浏览器把 docs/brand/icon.svg 渲染成 1024×1024 透明 PNG，然后：
python3 tools/brand/export-icons.py icon-1024.png
```

字体不入库：Inter 见 rsms.me/inter，Noto Sans SC 见 fonts.google.com/noto。
