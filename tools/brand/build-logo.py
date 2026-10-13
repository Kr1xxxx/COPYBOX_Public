#!/usr/bin/env python3
"""Builds the Clipboxx brand files in docs/brand/ (icon, wordmark, lockups).

Text is converted to outlines, so the SVG files need no fonts. To rebuild:

    pip install fonttools uharfbuzz
    python3 tools/brand/build-logo.py --inter /usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf \
        --noto NotoSansSC-500.ttf   # Noto Sans SC Medium (fonts.google.com/noto)

Only the outputs in docs/brand/ are committed; the fonts are not.
"""
import argparse, os
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

# Palette (from the existing icon and app/globals.css)
TILE = "#f6f5f2"       # icon background tile
DARK = "#232325"       # icon squircle
LAVENDER = "#ddd8ff"   # lock frame
PAPER = "#f9f8ff"      # lock body
VIOLET = "#776fb6"     # keyhole / accent letter (light)
INK = "#1f1e1c"; INK_DARK = "#f1efe7"
LINE = "#d9d5c9"; LINE_DARK = "#3f3d37"
MUTED = "#55534d"; MUTED_DARK = "#b3b0a4"

CAP = 1490 / 2048          # Inter Display cap height (em)
CN_MID = 0.385             # visual centre of 复制盒 above baseline (em), measured

class Face:
    def __init__(self, path):
        self.tt = TTFont(path); self.gs = self.tt.getGlyphSet(); self.upm = self.tt["head"].unitsPerEm
        blob = hb.Blob.from_file_path(path); face = hb.Face(blob); self.font = hb.Font(face)
    def shape(self, text, size, tracking=0.0):
        """Returns ([(glyph_path_d_at_origin, x_offset)], total_width) in px."""
        buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
        hb.shape(self.font, buf, {"kern": True, "liga": True})
        s = size / self.upm; x = 0.0; out = []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            name = self.tt.getGlyphName(info.codepoint)
            pen = SVGPathPen(self.gs); tp = TransformPen(pen, (s, 0, 0, -s, 0, 0))
            self.gs[name].draw(tp)
            out.append((pen.getCommands(), x + pos.x_offset * s, info.cluster))
            x += pos.x_advance * s + tracking * size
        return out, x - tracking * size

def paths(glyphs, dx, dy, color, cls=None):
    return "".join(f'<path fill="{color}" transform="translate({dx + x:.2f} {dy:.2f})" d="{d}"/>' for d, x, _ in glyphs if d)

def wordmark(inter, size, dx, dy, ink, accent):
    """'Clipboxx' with the last x in the accent colour. Returns (svg, width)."""
    g, w = inter.shape("Clipboxx", size, tracking=-0.028)
    return paths(g[:-1], dx, dy, ink) + paths(g[-1:], dx, dy, accent), w

def cn(noto, text, size, dx, dy, color, tracking=0.0):
    g, w = noto.shape(text, size, tracking)
    return paths(g, dx, dy, color), w

def mark(x, y, h, with_tile=False):
    """The icon squircle with the lock, scaled so the dark square is h tall (tile adds its margin)."""
    k = h / 656.0
    tile = f'<rect x="0" y="0" width="1024" height="1024" rx="228" fill="{TILE}"/>' if with_tile else ""
    off = 0 if with_tile else -184
    inner = f'''
<rect x="184" y="184" width="656" height="656" rx="196" fill="{DARK}"/>
<rect x="330" y="330" width="364" height="364" rx="104" fill="{LAVENDER}"/>
<rect x="392" y="362" width="240" height="220" rx="70" fill="{DARK}"/>
<rect x="366" y="471" width="292" height="192" rx="54" fill="{DARK}"/>
<path d="M454 398H570A26 26 0 0 1 596 424V442A10 10 0 0 1 586 452H438A10 10 0 0 1 428 442V424A26 26 0 0 1 454 398Z" fill="{LAVENDER}"/>
<rect x="403" y="489" width="218" height="137" rx="44" fill="{PAPER}"/>
<rect x="498" y="503" width="28" height="111" rx="14" fill="{VIOLET}"/>'''
    return f'<g transform="translate({x:.2f} {y:.2f}) scale({k:.5f}) translate({off} {off})">{tile}{inner}</g>'

def svg(w, h, body, bg=None):
    rect = f'<rect width="{w:.0f}" height="{h:.0f}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}">'
            f'{rect}{body}</svg>\n')

def build(inter, noto, out):
    os.makedirs(out, exist_ok=True)
    def write(name, s): open(os.path.join(out, name), "w").write(s)

    # 1. App icon (refined original): 1024 with tile, and the bare mark.
    write("icon.svg", svg(1024, 1024, mark(0, 0, 656, with_tile=True)))
    write("icon-mark.svg", svg(656, 656, mark(0, 0, 656)))

    for theme, ink, accent, line, muted, bg in (("light", INK, VIOLET, LINE, MUTED, None),
                                               ("dark", INK_DARK, LAVENDER, LINE_DARK, MUTED_DARK, None)):
        sfx = "" if theme == "light" else "-dark"
        pad = 24; size = 100; cap = CAP * size

        # 2. Wordmark: Clipboxx alone.
        wm, w = wordmark(inter, size, pad, pad + cap, ink, accent)
        write(f"wordmark{sfx}.svg", svg(w + 2 * pad, cap + 2 * pad + 4, wm))
        wm_mono, _ = wordmark(inter, size, pad, pad + cap, ink, ink)   # single colour (print, stamps)
        write(f"wordmark-mono{sfx}.svg", svg(w + 2 * pad, cap + 2 * pad + 4, wm_mono))

        # 3. Wordmark with Chinese: Clipboxx 复制盒 (one line, as in the settings header).
        cn_size = 46; gap = 22
        cn_base = pad + cap - cap / 2 + CN_MID * cn_size
        wm, w = wordmark(inter, size, pad, pad + cap, ink, accent)
        c, cw = cn(noto, "复制盒", cn_size, pad + w + gap, cn_base, muted, tracking=0.04)
        write(f"wordmark-cn{sfx}.svg", svg(w + gap + cw + 2 * pad, cap + 2 * pad + 4, wm + c))

        # 4. Horizontal lockup: mark + Clipboxx | 复制盒.
        mh = 104; mid = pad + mh / 2
        body = mark(pad, pad, mh)
        x = pad + mh + 26
        wm, w = wordmark(inter, size, x, mid + cap / 2, ink, accent); body += wm
        x += w + 26
        body += f'<rect x="{x:.2f}" y="{mid - 30:.2f}" width="2" height="60" rx="1" fill="{line}"/>'
        x += 2 + 24
        c, cw = cn(noto, "复制盒", 40, x, mid + CN_MID * 40, muted, tracking=0.06); body += c
        write(f"lockup-horizontal{sfx}.svg", svg(x + cw + pad, mh + 2 * pad, body))

        # 5. Stacked lockup: mark above, Clipboxx, 复制盒 letter-spaced.
        mh = 168; W = 520
        body = mark((W - mh) / 2, pad, mh)
        y = pad + mh + 40 + cap
        g, w = inter.shape("Clipboxx", size, tracking=-0.028)
        body += paths(g[:-1], (W - w) / 2, y, ink) + paths(g[-1:], (W - w) / 2, y, accent)
        cn_size = 34; y += 46 + cn_size * 0.85
        g2, w2 = noto.shape("复制盒", cn_size, tracking=0.5)
        body += paths(g2, (W - w2) / 2, y, muted)
        write(f"lockup-stacked{sfx}.svg", svg(W, y + cn_size * 0.15 + pad, body))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--inter", required=True); ap.add_argument("--noto", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "..", "docs", "brand"))
    a = ap.parse_args(); build(Face(a.inter), Face(a.noto), os.path.normpath(a.out))
    print("written to", os.path.normpath(a.out))
