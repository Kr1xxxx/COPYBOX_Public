#!/usr/bin/env python3
"""
lf_export.py — multi-format export orchestration for a finished logo mark.

Produces, from a single source SVG:
  - a PNG size matrix
  - favicon.ico (packed in pure Python — no dependency for this step)
  - an iOS app-icon size set and an Android mipmap size set (sizes are
    labeled "typical, verify current requirements" — platform icon size
    requirements do change; don't treat the hardcoded list as gospel for
    an actual store submission)
  - a social profile-picture crop size

The PNG rasterization step needs ONE of rsvg-convert / resvg / Inkscape on
PATH. If none is found, this script says so plainly and skips only that
step — it does not fail silently or produce a partial set without telling
you which parts are missing.

Usage:
    python3 lf_export.py path/to/primary.svg --outdir brand/export
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys

import lf_common as lc

FAVICON_SIZES = (16, 32, 48)
WEB_PNG_SIZES = (32, 64, 128, 256, 512)
IOS_SIZES_TYPICAL = (20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024)
ANDROID_SIZES_TYPICAL = (48, 72, 96, 144, 192, 512)
SOCIAL_SIZES = (512,)


def naive_minify_svg(text):
    """A small, dependency-free pass: strip XML comments and collapse
    redundant inter-tag whitespace. Not a substitute for svgo — if svgo is
    on PATH this script uses that instead (see optimize_svg below)."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    text = re.sub(r">\s+<", "><", text)
    return text.strip()


def optimize_svg(src_path, out_path):
    if shutil.which("svgo"):
        try:
            subprocess.run(["svgo", "-i", src_path, "-o", out_path], check=True, capture_output=True)
            return "svgo"
        except subprocess.CalledProcessError:
            pass  # fall through to the naive pass
    with open(src_path, "r", encoding="utf-8") as f:
        text = f.read()
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(naive_minify_svg(text))
    return "naive-minify (install svgo for better results)"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("svg", help="path to the source SVG (the chosen, finalized mark)")
    parser.add_argument("--outdir", default="brand/export", help="output directory (default: brand/export)")
    args = parser.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    summary = {"outdir": args.outdir, "steps": []}

    # --- optimize / copy source ------------------------------------------
    optimized_path = os.path.join(args.outdir, "source-optimized.svg")
    used = optimize_svg(args.svg, optimized_path)
    summary["steps"].append({"step": "optimize-svg", "ran": True, "method": used, "output": optimized_path})

    # --- rasterize ---------------------------------------------------------
    tool_name, invoke = lc.find_rasterizer()
    unique_sizes = sorted(set(FAVICON_SIZES) | set(WEB_PNG_SIZES) | set(IOS_SIZES_TYPICAL) | set(ANDROID_SIZES_TYPICAL) | set(SOCIAL_SIZES))

    rasterized = {}
    if tool_name is None:
        summary["steps"].append({
            "step": "rasterize",
            "ran": False,
            "reason": "no rasterizer found on PATH (looked for rsvg-convert, resvg, inkscape). "
                      "Install one of these to produce PNG/ICO/app-icon outputs — e.g. "
                      "`apt-get install librsvg2-bin` (rsvg-convert), or download `resvg`, "
                      "or install Inkscape. Only the optimized source SVG was produced this run.",
        })
    else:
        raster_dir = os.path.join(args.outdir, "png")
        os.makedirs(raster_dir, exist_ok=True)
        failed_sizes = []
        for size in unique_sizes:
            out_png = os.path.join(raster_dir, f"icon-{size}.png")
            try:
                invoke(args.svg, size, out_png)
                rasterized[size] = out_png
            except subprocess.CalledProcessError as e:
                failed_sizes.append({"size": size, "error": e.stderr.decode(errors="replace")[:200]})
        summary["steps"].append({
            "step": "rasterize", "ran": True, "tool": tool_name,
            "sizes_generated": sorted(rasterized.keys()), "sizes_failed": failed_sizes,
        })

    # --- favicon.ico (pure Python packing, no dependency) -----------------
    favicon_ready = all(size in rasterized for size in FAVICON_SIZES)
    if favicon_ready:
        ico_path = os.path.join(args.outdir, "favicon.ico")
        lc.pack_ico({size: rasterized[size] for size in FAVICON_SIZES}, ico_path)
        summary["steps"].append({"step": "favicon-ico", "ran": True, "output": ico_path})
    else:
        summary["steps"].append({
            "step": "favicon-ico", "ran": False,
            "reason": f"needs {FAVICON_SIZES}px PNGs from the rasterize step, which didn't all complete.",
        })

    # --- platform icon sets (just organized copies of already-rasterized PNGs) ---
    def stage_platform_set(name, sizes):
        if tool_name is None:
            summary["steps"].append({"step": f"{name}-icon-set", "ran": False, "reason": "rasterize step didn't run"})
            return
        platform_dir = os.path.join(args.outdir, name)
        os.makedirs(platform_dir, exist_ok=True)
        staged = []
        for size in sizes:
            if size in rasterized:
                dest = os.path.join(platform_dir, f"icon-{size}.png")
                shutil.copyfile(rasterized[size], dest)
                staged.append(size)
        summary["steps"].append({
            "step": f"{name}-icon-set", "ran": True, "sizes_staged": staged,
            "note": "sizes here are a typical/common set — verify against current platform "
                    "requirements before a real store submission, these change over time.",
        })

    stage_platform_set("ios", IOS_SIZES_TYPICAL)
    stage_platform_set("android", ANDROID_SIZES_TYPICAL)
    stage_platform_set("social", SOCIAL_SIZES)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
