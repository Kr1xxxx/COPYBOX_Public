#!/usr/bin/env python3
"""
lf_slop.py — structural hygiene + cliché-shape + doodle-complexity gate.

Stdlib only. Checks a candidate logo SVG for the mechanically-detectable
anti-patterns listed in references/anti-patterns.md: raster embeds, external
network references, the circular-gradient-blob cliché, excessive path count
on an icon-scale mark, and inconsistent stroke weights.

This is a BLOCKING gate: a non-zero exit code means at least one `fail`
severity violation was found. Callers (see SKILL.md Step 4) must check the
exit code and stop that candidate from advancing rather than only reading
the printed report.

Usage:
    python3 lf_slop.py path/to/candidate.svg [more.svg ...] [--spec BRAND.spec.md]
"""

import argparse
import json
import os
import re
import sys

import lf_common as lc

ICON_LIKE_EXCLUDE_HINTS = ("wordmark",)
DOODLE_PATH_COUNT_THRESHOLD = 40
OVERUSED_FONTS = {
    "inter", "geist", "space grotesk", "instrument serif", "poppins", "montserrat",
}
SHAPE_TAGS = ("path", "circle", "rect", "ellipse", "polygon", "polyline", "line")


def check_file(path, spec):
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()

    violations = []

    def fail(code, message):
        violations.append({"severity": "fail", "code": code, "message": message})

    def warn(code, message):
        violations.append({"severity": "warn", "code": code, "message": message})

    # --- viewBox present -----------------------------------------------
    if not lc.find_quoted_attr(text, "viewBox"):
        fail("no-viewbox", "no viewBox attribute found — the mark won't scale cleanly")

    # --- raster embeds ---------------------------------------------------
    if lc.count_tag(text, "image") > 0:
        fail("raster-embed", "an <image> element is present — logo SVGs must be pure vector, not a raster embed")

    for href in lc.find_quoted_attr(text, "href") + lc.find_quoted_attr(text, "xlink:href"):
        if href.lower().startswith("data:image") or re.search(r"\.(png|jpe?g|gif|webp)(\?|$)", href, re.IGNORECASE):
            fail("raster-href", f"href references a raster image ({href[:60]}) — must be pure vector")
        if href.lower().startswith(("http://", "https://")):
            fail("external-href", f"external network reference found in href: {href[:60]}")

    # --- external network references / imports --------------------------
    if re.search(r"@import\s+url\(", text, re.IGNORECASE):
        fail("external-import", "@import url(...) found — logo SVGs must be self-contained")
    if re.search(r"url\(\s*['\"]?https?://", text, re.IGNORECASE):
        fail("external-url", "an external http(s) url(...) reference was found — must be self-contained")
    for src in lc.find_quoted_attr(text, "src"):
        if src.lower().startswith(("http://", "https://")):
            fail("external-script", f"a <script src=...> references an external URL: {src[:60]}")
    if lc.count_tag(text, "script") > 0 and not any(
        v.lower().startswith(("http://", "https://")) for v in lc.find_quoted_attr(text, "src")
    ):
        warn("inline-script", "inline <script> present — fine for hand-authored animation logic, but confirm it's actually needed for a static logo asset")

    # --- circular-gradient-blob cliché (anti-patterns.md #1) -------------
    grad_count = lc.count_tag(text, "lineargradient") + lc.count_tag(text, "radialgradient")
    circle_count = lc.count_tag(text, "circle") + lc.count_tag(text, "ellipse")
    rotated_paths = len(re.findall(r'transform\s*=\s*["\'][^"\']*rotate', text, re.IGNORECASE))
    if grad_count > 0 and circle_count > 0:
        if rotated_paths >= 3:
            fail(
                "gradient-blob-cliche",
                f"circular shape(s) + gradient fill + {rotated_paths} rotated elements — matches the "
                "circular-gradient/'swirling hexagon' AI-logo cliché (anti-patterns.md #1). Regenerate with "
                "a flat fill and a non-radial base shape, or justify why this instance is different.",
            )
        else:
            warn(
                "possible-gradient-cliche",
                "circular shape(s) combined with a gradient fill — review against anti-patterns.md #1 "
                "before accepting; not automatically a fail, but worth a second look.",
            )

    # --- doodle / excessive path-count heuristic (anti-patterns.md #10, #11) ---
    stem = os.path.splitext(os.path.basename(path))[0].lower()
    is_icon_like = not any(hint in stem for hint in ICON_LIKE_EXCLUDE_HINTS)
    shape_count = sum(lc.count_tag(text, tag) for tag in SHAPE_TAGS)
    if is_icon_like and shape_count > DOODLE_PATH_COUNT_THRESHOLD:
        fail(
            "high-shape-count",
            f"{shape_count} shape elements in an icon-scale file (threshold {DOODLE_PATH_COUNT_THRESHOLD}) — "
            "likely reads as an illustrated doodle rather than a constructed mark (anti-patterns.md #10).",
        )

    # --- stroke-width consistency (anti-patterns.md #11 / design-principles §1) ---
    raw_widths = lc.find_quoted_attr(text, "stroke-width") + lc.find_style_prop(text, "stroke-width")
    widths = set()
    for w in raw_widths:
        try:
            val = float(re.sub(r"[a-zA-Z%]", "", w).strip())
        except ValueError:
            continue
        if val > 0:
            widths.add(round(val, 2))
    if len(widths) > 2:
        fail(
            "inconsistent-stroke-widths",
            f"{len(widths)} distinct nonzero stroke-width values used ({sorted(widths)}) — a gridded mark "
            "should use at most 1-2 stroke weights (design-principles.md §1).",
        )

    # --- icon aspect ratio (only meaningful for icon-scale files) --------
    if is_icon_like:
        viewboxes = lc.find_quoted_attr(text, "viewBox")
        if viewboxes:
            parts = viewboxes[0].split()
            if len(parts) == 4:
                try:
                    vb_w, vb_h = float(parts[2]), float(parts[3])
                    if vb_h > 0 and not (0.85 <= vb_w / vb_h <= 1.15):
                        warn(
                            "non-square-icon",
                            f"viewBox aspect ratio is {vb_w:.0f}:{vb_h:.0f} — icon-scale marks are usually "
                            "square-ish; confirm this is intentional.",
                        )
                except ValueError:
                    pass

    # --- overused default fonts (anti-patterns.md #7) --------------------
    font_values = lc.find_quoted_attr(text, "font-family") + lc.find_style_prop(text, "font-family")
    for fv in font_values:
        first = fv.split(",")[0].strip().strip("'\"").lower()
        if first in OVERUSED_FONTS:
            warn(
                "overused-font",
                f"font-family '{first}' is one of the commonly overused AI-default typefaces — not wrong "
                "by itself, but confirm kerning/tracking was deliberately adjusted (anti-patterns.md #7), "
                "not left at the family's default.",
            )

    # --- project-specific banned motifs from BRAND.spec.md ---------------
    for motif in spec.get("banned_motifs", []) or []:
        if isinstance(motif, str) and motif.lower() in text.lower():
            warn("project-banned-motif", f"file contains project-banned motif text '{motif}' — review.")

    return violations


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", help="candidate SVG file(s) to check")
    parser.add_argument("--spec", default="BRAND.spec.md", help="path to BRAND.spec.md (default: ./BRAND.spec.md)")
    args = parser.parse_args()

    spec = lc.parse_brand_spec(args.spec)

    report = {}
    any_fail = False
    for path in args.files:
        violations = check_file(path, spec)
        report[path] = violations
        if any(v["severity"] == "fail" for v in violations):
            any_fail = True

    print(json.dumps(report, indent=2))
    sys.exit(1 if any_fail else 0)


if __name__ == "__main__":
    main()
