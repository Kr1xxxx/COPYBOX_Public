#!/usr/bin/env python3
"""Writes src-tauri/icons/icon.png, icon.ico and icon.icns from a 1024×1024 PNG of docs/brand/icon.svg.

    python3 tools/brand/export-icons.py icon-1024.png

Render the PNG with any browser (the SVG has no fonts). ICO holds 16–256 px PNG frames; ICNS holds the
PNG sizes Tauri's own `tauri icon` writes, plus ARGB (packbits) for the two legacy 16/32 px slots.
"""
import struct, sys, io, os
from PIL import Image

def packbits(data):
    out = bytearray(); i = 0; n = len(data)
    while i < n:
        run = 1
        while i + run < n and run < 130 and data[i + run] == data[i]: run += 1
        if run >= 3:
            out += bytes([run - 3 + 128, data[i]]); i += run; continue
        j = i
        while j < n and j - i < 128:
            if j + 2 < n and data[j] == data[j + 1] == data[j + 2]: break
            j += 1
        out += bytes([j - i - 1]) + data[i:j]; i = j
    return bytes(out)

def argb(im):
    px = im.convert("RGBA").tobytes()
    return b"ARGB" + b"".join(packbits(px[c::4]) for c in (3, 0, 1, 2))

def png(im):
    b = io.BytesIO(); im.save(b, "PNG", optimize=True); return b.getvalue()

def main(src, out_dir):
    base = Image.open(src).convert("RGBA"); assert base.size == (1024, 1024), base.size
    def at(n): return base.resize((n, n), Image.LANCZOS)
    base.save(os.path.join(out_dir, "icon.png"), "PNG", optimize=True)
    at(256).save(os.path.join(out_dir, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
                 append_images=[at(n) for n in (16, 24, 32, 48, 64, 128)])
    entries = [(b"ic04", argb(at(16))), (b"ic05", argb(at(32))), (b"ic11", png(at(32))), (b"ic12", png(at(64))),
               (b"ic07", png(at(128))), (b"ic13", png(at(256))), (b"ic08", png(at(256))), (b"ic14", png(at(512))),
               (b"ic09", png(at(512))), (b"ic10", png(base))]
    body = b"".join(t + struct.pack(">I", len(d) + 8) + d for t, d in entries)
    open(os.path.join(out_dir, "icon.icns"), "wb").write(b"icns" + struct.pack(">I", len(body) + 8) + body)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "..", "src-tauri", "icons"))
