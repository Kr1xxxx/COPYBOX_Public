"""
lf_common.py — shared stdlib-only utilities for the logo-forge gate/export scripts.

No third-party dependencies. Everything here uses only the Python standard
library (re, json, struct, zlib, shutil, subprocess) so the gates run
identically on any machine with a Python 3 interpreter and nothing else.
"""

import json
import os
import re
import shutil
import struct
import subprocess
import zlib


# ---------------------------------------------------------------------------
# BRAND.spec.md parsing (a fenced ```yaml block with a small, flat schema —
# not a general YAML parser; deliberately just enough for our known keys)
# ---------------------------------------------------------------------------

_SPEC_BLOCK_RE = re.compile(r"```yaml\s*\n(.*?)\n```", re.DOTALL)
_SPEC_LINE_RE = re.compile(r'^([A-Za-z0-9_]+)\s*:\s*(.*)$')


def parse_brand_spec(path):
    """Parse the fenced yaml block in a BRAND.spec.md file into a dict.

    Supports: bare words, quoted strings, true/false, numbers, and
    JSON-style lists/arrays (e.g. ["#111111", "#E8542F"] or []).
    Returns {} if the file doesn't exist or has no yaml block — callers
    should apply their own defaults in that case.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return {}

    match = _SPEC_BLOCK_RE.search(text)
    if not match:
        return {}

    spec = {}
    for line in match.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = _SPEC_LINE_RE.match(line)
        if not m:
            continue
        key, raw_value = m.group(1), m.group(2).strip()
        # strip inline comments (a bare '#' outside of quotes/brackets)
        if raw_value.startswith("[") or raw_value.startswith('"') or raw_value.startswith("'"):
            pass
        else:
            raw_value = raw_value.split("#")[0].strip()
        spec[key] = _coerce_yaml_scalar(raw_value)
    return spec


def _coerce_yaml_scalar(raw_value):
    if raw_value == "":
        return ""
    if raw_value.lower() in ("true", "false"):
        return raw_value.lower() == "true"
    if raw_value.startswith("[") or raw_value.startswith("{"):
        try:
            return json.loads(raw_value)
        except json.JSONDecodeError:
            return raw_value
    if (raw_value.startswith('"') and raw_value.endswith('"')) or (
        raw_value.startswith("'") and raw_value.endswith("'")
    ):
        return raw_value[1:-1]
    try:
        if "." in raw_value:
            return float(raw_value)
        return int(raw_value)
    except ValueError:
        return raw_value


# ---------------------------------------------------------------------------
# Lightweight, regex-based SVG lexing.
# Deliberately NOT a full XML/CSS parser — these scripts gate simple,
# self-contained, agent-authored logo SVGs, not arbitrary uploaded files.
# A regex pass over the raw text is robust to attribute order/quoting and
# needs no dependency, which matters more here than perfect CSS fidelity.
# ---------------------------------------------------------------------------

def count_tag(text, tag_name):
    """Count opening tags <tag_name ...> or <tag_name> (case-insensitive)."""
    return len(re.findall(r"<\s*" + re.escape(tag_name) + r"(?=[\s/>])", text, re.IGNORECASE))


def find_quoted_attr(text, attr_name):
    """Return all values of attr_name="..." or attr_name='...' in the text."""
    pattern = re.escape(attr_name) + r'\s*=\s*(["\'])(.*?)\1'
    return [m.group(2) for m in re.finditer(pattern, text, re.IGNORECASE)]


def extract_style_blocks(text):
    """Return the concatenated contents of all <style>...</style> blocks."""
    return "\n".join(
        m.group(1) for m in re.finditer(r"<style[^>]*>(.*?)</style>", text, re.IGNORECASE | re.DOTALL)
    )


def find_style_prop(text, prop_name):
    """Find prop_name: value; pairs both inside style="..." attributes and
    inside any <style> block. Returns a list of raw value strings."""
    values = []
    # inside style="..." attributes
    for style_val in find_quoted_attr(text, "style"):
        values.extend(_scan_css_prop(style_val, prop_name))
    # inside <style> blocks (covers both inline rules and class selectors)
    values.extend(_scan_css_prop(extract_style_blocks(text), prop_name))
    return values


def _scan_css_prop(css_text, prop_name):
    pattern = re.escape(prop_name) + r"\s*:\s*([^;}\n]+)"
    return [m.group(1).strip() for m in re.finditer(pattern, css_text, re.IGNORECASE)]


# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------

_IGNORED_COLOR_VALUES = {"none", "transparent", "currentcolor", "inherit"}


def normalize_hex_color(value):
    """Return a normalized #RRGGBB uppercase string, or None if not a plain
    hex color (rgb()/named colors/gradients/url() refs are left alone —
    callers should treat None as 'not a countable flat color')."""
    v = value.strip()
    if v.lower() in _IGNORED_COLOR_VALUES:
        return None
    if not v.startswith("#"):
        return None
    hex_part = v[1:]
    if len(hex_part) == 3 and all(c in "0123456789abcdefABCDEF" for c in hex_part):
        hex_part = "".join(c * 2 for c in hex_part)
    if len(hex_part) == 6 and all(c in "0123456789abcdefABCDEF" for c in hex_part):
        return "#" + hex_part.upper()
    return None


def hex_to_rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def color_distance(hex_a, hex_b):
    ra, ga, ba = hex_to_rgb(hex_a)
    rb, gb, bb = hex_to_rgb(hex_b)
    return ((ra - rb) ** 2 + (ga - gb) ** 2 + (ba - bb) ** 2) ** 0.5


def extract_flat_colors(text):
    """Collect every plain hex color used as a fill or stroke, from both
    attributes and style declarations. Returns a sorted set of #RRGGBB."""
    raw_values = (
        find_quoted_attr(text, "fill")
        + find_quoted_attr(text, "stroke")
        + find_style_prop(text, "fill")
        + find_style_prop(text, "stroke")
    )
    colors = set()
    for v in raw_values:
        norm = normalize_hex_color(v)
        if norm:
            colors.add(norm)
    return colors


# ---------------------------------------------------------------------------
# SVG rasterizer detection (external tool required for anything that turns
# vector into pixels — there is no pure-stdlib SVG rasterizer, so this is
# the one place these scripts genuinely depend on something external, and
# they say so plainly rather than silently degrading).
# ---------------------------------------------------------------------------

def find_rasterizer():
    """Return (tool_name, invoke_fn) for the first rasterizer found on PATH,
    or (None, None) if nothing is available. invoke_fn(svg_path, size, out_png_path)
    raises subprocess.CalledProcessError on failure."""
    if shutil.which("rsvg-convert"):
        def invoke(svg_path, size, out_path):
            subprocess.run(
                ["rsvg-convert", "-w", str(size), "-h", str(size), "--output", out_path, svg_path],
                check=True, capture_output=True,
            )
        return "rsvg-convert", invoke

    if shutil.which("resvg"):
        def invoke(svg_path, size, out_path):
            subprocess.run(
                ["resvg", "--width", str(size), "--height", str(size), svg_path, out_path],
                check=True, capture_output=True,
            )
        return "resvg", invoke

    if shutil.which("inkscape"):
        def invoke(svg_path, size, out_path):
            subprocess.run(
                [
                    "inkscape", svg_path,
                    f"--export-width={size}", f"--export-height={size}",
                    f"--export-filename={out_path}",
                ],
                check=True, capture_output=True,
            )
        return "inkscape", invoke

    # Lower-priority fallback: ImageMagick, if present. Quality depends on
    # which SVG delegate it's built against (librsvg gives good results;
    # ImageMagick's own built-in MSVG renderer is weaker on gradients/text) —
    # prefer a purpose-built tool above when available.
    magick_bin = shutil.which("magick") or shutil.which("convert")
    if magick_bin:
        def invoke(svg_path, size, out_path):
            subprocess.run(
                [magick_bin, "-background", "none", svg_path, "-resize", f"{size}x{size}", out_path],
                check=True, capture_output=True,
            )
        return os.path.basename(magick_bin), invoke

    return None, None


# ---------------------------------------------------------------------------
# Minimal, dependency-free 8-bit PNG decoder.
# Supports grayscale (0), RGB (2), grayscale+alpha (4), and RGBA (6) at
# 8 bits/channel, non-interlaced — which is what every common SVG
# rasterizer (rsvg-convert, resvg, Inkscape) produces by default at the
# sizes this skill needs. Indexed-palette PNGs (color type 3) are not
# supported; callers should request RGBA output from the rasterizer.
# ---------------------------------------------------------------------------

_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
_CHANNELS_BY_COLOR_TYPE = {0: 1, 2: 3, 4: 2, 6: 4}


class PngDecodeError(Exception):
    pass


def decode_png_8bit(path):
    """Return (width, height, channels, pixel_bytes) for a simple 8-bit PNG.

    pixel_bytes is a flat bytearray, row-major, `channels` bytes/pixel.
    """
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != _PNG_SIGNATURE:
        raise PngDecodeError("not a PNG file")

    pos = 8
    width = height = bit_depth = color_type = None
    idat = bytearray()
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        chunk_type = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length  # 4 length + 4 type + length data + 4 crc
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type = struct.unpack(">IIBB", chunk[:10])
        elif chunk_type == b"IDAT":
            idat.extend(chunk)
        elif chunk_type == b"IEND":
            break

    if width is None:
        raise PngDecodeError("missing IHDR chunk")
    if bit_depth != 8:
        raise PngDecodeError(f"only 8-bit PNGs are supported by this lightweight decoder (got {bit_depth})")
    if color_type not in _CHANNELS_BY_COLOR_TYPE:
        raise PngDecodeError(f"unsupported PNG color type {color_type} (indexed-palette PNGs aren't supported — request RGBA output from the rasterizer)")

    channels = _CHANNELS_BY_COLOR_TYPE[color_type]
    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    pixels = bytearray(height * stride)
    prev_row = bytearray(stride)
    read_pos = 0

    for y in range(height):
        filter_type = raw[read_pos]
        read_pos += 1
        row = bytearray(raw[read_pos:read_pos + stride])
        read_pos += stride
        _unfilter_row(row, prev_row, filter_type, channels)
        pixels[y * stride:(y + 1) * stride] = row
        prev_row = row

    return width, height, channels, pixels


def _unfilter_row(row, prev_row, filter_type, bpp):
    if filter_type == 0:
        return
    for x in range(len(row)):
        a = row[x - bpp] if x >= bpp else 0
        b = prev_row[x]
        c = prev_row[x - bpp] if x >= bpp else 0
        if filter_type == 1:
            row[x] = (row[x] + a) & 0xFF
        elif filter_type == 2:
            row[x] = (row[x] + b) & 0xFF
        elif filter_type == 3:
            row[x] = (row[x] + (a + b) // 2) & 0xFF
        elif filter_type == 4:
            p = a + b - c
            pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
            row[x] = (row[x] + pred) & 0xFF
        else:
            raise PngDecodeError(f"unsupported PNG filter type {filter_type}")


# ---------------------------------------------------------------------------
# ICO packing (pure Python — modern ICO supports embedding raw PNG data
# directly per entry, so no BMP re-encoding is needed)
# ---------------------------------------------------------------------------

def pack_ico(png_paths_by_size, out_path):
    """png_paths_by_size: dict of {pixel_size: path_to_png_file}.
    Writes a valid multi-size .ico by embedding the PNG bytes as-is."""
    sizes = sorted(png_paths_by_size.keys())
    entries = []
    png_blobs = []
    offset = 6 + 16 * len(sizes)  # ICONDIR + one ICONDIRENTRY per image
    for size in sizes:
        with open(png_paths_by_size[size], "rb") as f:
            blob = f.read()
        w = size if size < 256 else 0
        h = size if size < 256 else 0
        entries.append(struct.pack("<4B2H2I", w, h, 0, 0, 1, 32, len(blob), offset))
        png_blobs.append(blob)
        offset += len(blob)

    with open(out_path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(sizes)))  # ICONDIR
        for entry in entries:
            f.write(entry)
        for blob in png_blobs:
            f.write(blob)
