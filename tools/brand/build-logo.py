#!/usr/bin/env python3
"""Builds the COPYBOXX brand files in docs/brand/ (icon, wordmark, lockups).

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
LAVENDER = "#c4b9ff"   # accent letter on dark (= icon item, light end)
VIOLET = "#8f7ff6"     # accent letter on light (= icon item, dark end)
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

NAME = "COPYBOXX"; TRACK = 0.02   # all caps: a little positive tracking

def wordmark(inter, size, dx, dy, ink, accent):
    """The wordmark with the last X in the accent colour. Returns (svg, width)."""
    g, w = inter.shape(NAME, size, tracking=TRACK)
    return paths(g[:-1], dx, dy, ink) + paths(g[-1:], dx, dy, accent), w

def cn(noto, text, size, dx, dy, color, tracking=0.0):
    g, w = noto.shape(text, size, tracking)
    return paths(g, dx, dy, color), w

DARK_A = "#2d2b33"; DARK_B = "#16151b"   # squircle gradient, top-left -> bottom-right
WHITE = "#ffffff"                        # the C
PURPLE_A = "#c4b9ff"; PURPLE_B = "#8f7ff6" # the copied item, top-left -> bottom-right
DASH = "rgba(40, 30, 90, .45)"             # the text line on the item

def mark(x, y, h, with_tile=False):
    """The icon, traced from the owner's 1024 px original: a dark gradient squircle (928 of 1024, r 230),
    a white C (sideways U, stroke 108, round caps) and a tilted purple item with a text line in its mouth.
    h = squircle height. with_tile is accepted for compatibility; the icon has no tile, the outside is transparent."""
    k = h / 928.0
    off = 0 if with_tile else -48
    inner = f'''
<defs>
<linearGradient id="sq" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{DARK_A}"/><stop offset="1" stop-color="{DARK_B}"/></linearGradient>
<linearGradient id="pu" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{PURPLE_A}"/><stop offset="1" stop-color="{PURPLE_B}"/></linearGradient>
</defs>
<rect x="48" y="48" width="928" height="928" rx="230" fill="url(#sq)"/>
<rect x="49.5" y="49.5" width="925" height="925" rx="228.5" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="3"/>
<path d="M673 280H404A160 160 0 0 0 244 440V584A160 160 0 0 0 404 744H673" fill="none" stroke="{WHITE}" stroke-width="108" stroke-linecap="round" stroke-linejoin="round"/>
<g transform="rotate(-6 734 512)">
<rect x="646" y="434" width="176" height="156" rx="40" fill="url(#pu)"/>
<rect x="676" y="474" width="88" height="20" rx="10" fill="{DASH}"/>
</g>'''
    return f'<g transform="translate({x:.2f} {y:.2f}) scale({k:.5f}) translate({off} {off})">{inner}</g>'

def svg(w, h, body, bg=None):
    rect = f'<rect width="{w:.0f}" height="{h:.0f}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}">'
            f'{rect}{body}</svg>\n')

def build(inter, noto, out):
    os.makedirs(out, exist_ok=True)
    def write(name, s): open(os.path.join(out, name), "w").write(s)

    # 1. App icon: 1024 with tile, and the bare mark.
    write("icon.svg", svg(1024, 1024, mark(0, 0, 928, with_tile=True)))
    write("icon-mark.svg", svg(928, 928, mark(0, 0, 928)))

    for theme, ink, accent, line, muted, bg in (("light", INK, VIOLET, LINE, MUTED, None),
                                               ("dark", INK_DARK, LAVENDER, LINE_DARK, MUTED_DARK, None)):
        sfx = "" if theme == "light" else "-dark"
        pad = 24; size = 100; cap = CAP * size

        # 2. Wordmark alone.
        wm, w = wordmark(inter, size, pad, pad + cap, ink, accent)
        write(f"wordmark{sfx}.svg", svg(w + 2 * pad, cap + 2 * pad, wm))
        wm_mono, _ = wordmark(inter, size, pad, pad + cap, ink, ink)   # single colour (print, stamps)
        write(f"wordmark-mono{sfx}.svg", svg(w + 2 * pad, cap + 2 * pad, wm_mono))

        # 3. Wordmark with Chinese: COPYBOXX 复制盒 (one line, for a page header).
        cn_size = 46; gap = 22
        cn_base = pad + cap - cap / 2 + CN_MID * cn_size
        wm, w = wordmark(inter, size, pad, pad + cap, ink, accent)
        c, cw = cn(noto, "复制盒", cn_size, pad + w + gap, cn_base, muted, tracking=0.04)
        write(f"wordmark-cn{sfx}.svg", svg(w + gap + cw + 2 * pad, cap + 2 * pad, wm + c))

        # 4. Horizontal lockup: mark + COPYBOXX | 复制盒.
        mh = 104; mid = pad + mh / 2
        body = mark(pad, pad, mh)
        x = pad + mh + 26
        wm, w = wordmark(inter, size, x, mid + cap / 2, ink, accent); body += wm
        x += w + 26
        body += f'<rect x="{x:.2f}" y="{mid - 30:.2f}" width="2" height="60" rx="1" fill="{line}"/>'
        x += 2 + 24
        c, cw = cn(noto, "复制盒", 40, x, mid + CN_MID * 40, muted, tracking=0.06); body += c
        write(f"lockup-horizontal{sfx}.svg", svg(x + cw + pad, mh + 2 * pad, body))

        # 5. Stacked lockup: mark above, COPYBOXX, 复制盒 letter-spaced.
        mh = 168
        g, w = inter.shape(NAME, size, tracking=TRACK)
        W = w + 2 * pad + 32
        body = mark((W - mh) / 2, pad, mh)
        y = pad + mh + 40 + cap
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
