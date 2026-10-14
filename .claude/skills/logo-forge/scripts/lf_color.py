#!/usr/bin/env python3
"""
lf_color.py — palette/color-count conformance gate, plus an optional
legibility-at-small-size check.

Stdlib only for the conformance check. The legibility check needs an SVG
rasterizer on PATH (rsvg-convert, resvg, or Inkscape) — if none is found,
it prints an explicit warning and skips rather than silently omitting the
check. Decoding the resulting PNG uses lf_common's dependency-free decoder,
not Pillow, so this script has no third-party requirement either way.

Usage:
    python3 lf_color.py path/to/candidate.svg [--spec BRAND.spec.md] [--legibility-check]
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

import lf_common as lc

PALETTE_MATCH_TOLERANCE = 12.0  # max RGB euclidean distance to count as "the same" locked color
LOW_COVERAGE_THRESHOLD = 0.05   # mark all but disappears at small size
HIGH_COVERAGE_THRESHOLD = 0.88  # mark reads as a near-solid block at small size


def check_palette(text, spec):
    max_colors = spec.get("max_colors", 2)
    locked_palette = spec.get("locked_palette", []) or []
    found = sorted(lc.extract_flat_colors(text))

    violations = []
    if locked_palette:
        for color in found:
            if not any(lc.color_distance(color, locked) <= PALETTE_MATCH_TOLERANCE for locked in locked_palette):
                violations.append({
                    "severity": "fail",
                    "code": "off-palette-color",
                    "message": f"{color} is not within tolerance of any locked palette color {locked_palette}",
                })
    else:
        if len(found) > max_colors:
            violations.append({
                "severity": "fail",
                "code": "too-many-colors",
                "message": f"{len(found)} distinct flat colors found {found} — cap is {max_colors} "
                           "(design-principles.md §4). Lock a palette in BRAND.spec.md once colors are decided.",
            })

    return found, violations


def legibility_check(svg_path, size=16):
    """Rasterize at `size`px and report foreground ink coverage as a proxy
    for 'does this collapse into a blob or vanish at small scale'."""
    tool_name, invoke = lc.find_rasterizer()
    if tool_name is None:
        return {
            "ran": False,
            "reason": "no rasterizer found on PATH (looked for rsvg-convert, resvg, inkscape) — "
                      "install one of these to enable the automated legibility-at-size check; "
                      "until then, do this check visually (design-principles.md §5-6).",
        }

    with tempfile.TemporaryDirectory() as tmp:
        out_png = os.path.join(tmp, f"raster_{size}.png")
        try:
            invoke(svg_path, size, out_png)
        except subprocess.CalledProcessError as e:
            return {"ran": False, "reason": f"{tool_name} failed: {e.stderr.decode(errors='replace')[:300]}"}

        try:
            width, height, channels, pixels = lc.decode_png_8bit(out_png)
        except lc.PngDecodeError as e:
            return {"ran": False, "reason": f"could not decode rasterizer output: {e}"}

    total_pixels = width * height
    if channels == 4:
        ink_pixels = sum(1 for i in range(3, len(pixels), channels) if pixels[i] > 128)
    else:
        # no alpha channel available — approximate via luminance distance from the
        # corner pixel (assumed background)
        bg = tuple(pixels[0:channels])
        ink_pixels = 0
        for i in range(0, len(pixels), channels):
            px = tuple(pixels[i:i + channels])
            if sum(abs(a - b) for a, b in zip(px, bg)) > 60:
                ink_pixels += 1

    coverage = ink_pixels / total_pixels if total_pixels else 0.0
    result = {"ran": True, "tool": tool_name, "size_px": size, "ink_coverage": round(coverage, 3)}

    if coverage < LOW_COVERAGE_THRESHOLD:
        result["severity"] = "fail"
        result["message"] = f"ink coverage only {coverage:.1%} at {size}px — the mark nearly disappears at small scale (design-principles.md §6)."
    elif coverage > HIGH_COVERAGE_THRESHOLD:
        result["severity"] = "warn"
        result["message"] = f"ink coverage {coverage:.1%} at {size}px — the mark reads as a near-solid block; confirm the silhouette is still distinct, not just a filled blob."
    else:
        result["severity"] = "pass"
        result["message"] = f"ink coverage {coverage:.1%} at {size}px — within a reasonable range; still eyeball it, this is a coverage proxy, not a full silhouette-distinctiveness check."

    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", help="candidate SVG file to check")
    parser.add_argument("--spec", default="BRAND.spec.md", help="path to BRAND.spec.md (default: ./BRAND.spec.md)")
    parser.add_argument("--legibility-check", action="store_true", help="also attempt the small-size rasterized legibility check")
    args = parser.parse_args()

    spec = lc.parse_brand_spec(args.spec)
    with open(args.file, "r", encoding="utf-8") as f:
        text = f.read()

    found_colors, violations = check_palette(text, spec)
    report = {"file": args.file, "found_colors": found_colors, "violations": violations}

    if args.legibility_check:
        report["legibility"] = legibility_check(args.file)
        if report["legibility"].get("severity") == "fail":
            violations.append({
                "severity": "fail",
                "code": "legibility-fail",
                "message": report["legibility"]["message"],
            })

    print(json.dumps(report, indent=2))
    sys.exit(1 if any(v["severity"] == "fail" for v in violations) else 0)


if __name__ == "__main__":
    main()
