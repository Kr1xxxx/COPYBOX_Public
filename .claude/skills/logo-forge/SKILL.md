---
name: logo-forge
description: Generates premium, professional-looking logo sets — primary combination mark, icon-only mark, wordmark, monogram, lockups, and full-color/mono/reversed variants — as clean procedural SVG, ranging from static minimalist marks to animated motion marks (stroke-draw, morph, kinetic type). Enforces deterministic anti-slop gates (color-count caps, grid/stroke conformance, flat-black-and-white silhouette test, cliché-shape detection for gradient blobs/swooshes/generic swirls) before anything ships, plus a taste system with banned motifs and style dials. Use this whenever the user asks for a logo, brand mark, icon, favicon set, app-icon set, wordmark, monogram, or an animated/motion logo — even indirectly ("give this project a visual identity", "make an icon for X", "brand this app", "I need a logo for my startup", "design a mark for Y").
---

# Logo Forge

Generates a full premium logo set for a project/brand as procedural SVG — never diffusion/raster image generation — then runs it through deterministic quality gates before anything is presented as final. Output ranges from a single flat minimalist mark to a complete animated identity system.

**Core principle (same as any other deterministic-gate skill in this project): scripts hold the line across runs; agent instructions drift.** Never skip `scripts/lf_slop.py` or `scripts/lf_color.py` because "this one looks fine." A failing gate blocks assembly — it does not get silently logged and ignored. (This is the exact bug class to avoid: a gate that fails but doesn't block the deliverable is worse than no gate at all.)

## Workflow

### Step 0 — Load the spec
Read `assets/BRAND.spec.template.md`. Copy it to the project as `BRAND.spec.md` and fill it in from the brief (see Step 1). This file is the single source of truth the gates check against — same role `DESIGN.md` plays for UI-theme gates. Every subsequent step reads from this file, not from freeform memory of the conversation.

### Step 1 — Brief intake (keep it short)
Don't run a long interview. Get only what changes the output:
1. **Name/word to render** (for wordmark/monogram) and **niche/industry**.
2. **Style dial**: geometric vs. organic; golden-ratio/φ construction vs. 1:1 (stable) vs. 3:2 (editorial) grid; how many colors (1 or 2, default 2).
3. **Deliverable scope**: static set only, or static + animated variant?
4. **Anchor**: a concrete metaphor or object tied to the niche, and/or a named design movement (Bauhaus, Swiss International, Memphis, mid-century) to anchor the direction. If the user has no preference, pick one yourself from `references/taste-system.md` and state the assumption — don't default to "another tech-abstract mark," see anti-patterns.

If the brief is genuinely ambiguous on the anchor/metaphor (the single input most likely to send this in a completely different direction), ask one question. Everything else, assume a sensible default and proceed.

Write the answers into `BRAND.spec.md`.

### Step 2 — Taste lock
Read `references/taste-system.md` and `references/anti-patterns.md` in full before generating anything. Select:
- One canonical design language anchor (not "generic tech").
- A banned-motif list for this run (start from the default catalog in anti-patterns.md; add any project-specific bans to `BRAND.spec.md`).
- A max color count (default 2) and, if the brief gives real brand colors, a locked palette.

### Step 3 — Parallel fan-out generation
Generate **5 distinct directions** as separate SVG files, each built on an explicit grid (see `references/design-principles.md` for grid/golden-ratio/negative-space construction techniques — do not freehand paths):
1. `concrete-metaphor.svg` — a real object from the niche, simplified to its most iconic silhouette.
2. `monogram.svg` — initials constructed on the chosen grid.
3. `negative-space.svg` — attempt to hide a secondary, relevant shape in the counterspace (this is the hardest one to land — if it doesn't work cleanly, it's fine for this direction to be weaker than the others; don't force a bad negative-space hack into the final set).
4. `geometric-abstract.svg` — pure grid-derived abstraction, no literal reference.
5. `wordmark.svg` — the name in one type family, with intentional letter-spacing/kerning adjustments; no default/unmodified webfont at 100% out of the box.

Each file: single flat fill or the locked 2-color palette, `viewBox` set, no gradients unless the taste system explicitly allows one, self-contained (no external font/image/script references).

If subagents are available, fan these out in parallel and have each subagent read `references/design-principles.md` + `BRAND.spec.md` first. If not, generate them sequentially in the same session.

### Step 4 — Deterministic gate (blocking)
Run against every candidate file:
```bash
python3 scripts/lf_slop.py <file>.svg --spec BRAND.spec.md
python3 scripts/lf_color.py <file>.svg --spec BRAND.spec.md
```
Both exit non-zero on any `fail`-severity violation. **Check the exit code. A non-zero exit blocks that candidate from advancing — fix it or drop it, don't carry it forward "to see how it looks in the gallery."** Read the JSON report each script prints for the specific violations (color count, cliché-shape score, stroke-width inconsistency, raster/external-reference hygiene, path-count/doodle heuristic).

### Step 5 — Flat black & white + small-size check
For each candidate that passed Step 4, strip color (render fill:#000 / stroke:#000 on white) and check the mark is still legible and distinct — this is the single highest-value premium/cheap discriminator (see `references/design-principles.md`). If a rasterizer is available (`rsvg-convert`, `resvg`, or Inkscape CLI), `lf_color.py --legibility-check` will do this automatically at 16px/32px; otherwise do it visually and note in the critique that automated legibility-at-size wasn't run (don't silently skip — say so).

### Step 6 — Critique and rank
Score surviving candidates on: balance, negative-space use, distinctiveness (shape-distance from the anti-pattern corpus, already partially covered by the gate), legibility at favicon scale, motion-readiness (does the silhouette have a natural single "gesture" for animation later). Present the top 1–2 with the rest as alternates — don't force a single winner if two directions are genuinely close; let the person pick.

### Step 7 — Assemble the full deliverable set
Once a direction is chosen, read `references/deliverable-spec.md` and produce the full variant matrix (primary lockup, icon-only, wordmark-only, monogram, horizontal + stacked lockups, full-color / single-color-black / reversed-white) plus the spec sheet (minimum size, clear space). Then run:
```bash
python3 scripts/lf_export.py <primary>.svg --outdir <project>/brand/export
```
This produces the PNG size matrix, `favicon.ico`, and app-icon size sets. It will tell you plainly which steps it had to skip because a rasterizer (`rsvg-convert`/`inkscape`/`resvg`) wasn't found on the system — surface that to the user rather than silently producing a partial set.

### Step 8 — Animation (only if requested in the brief)
Read `references/animation-guide.md` and pick the tier:
- **Default: SMIL/CSS stroke-draw.** Self-contained, no runtime, agent-authorable directly in the SVG. Use for a reveal/intro of the chosen mark.
- **GSAP/anime.js**, if richer sequencing or a morph between two of the generated candidates is wanted. Morphs only work well between shapes with matching node structure — see the guide before promising a morph between arbitrary candidates.
- **Lottie JSON**, only if the person specifically needs cross-platform (iOS/Android native) playback. Note this can't be hand-authored as easily as the other two — generate it programmatically per the guide, don't fake it.
Keep motion restrained: one memorable gesture, resolves in under ~2s, and always ship a static fallback frame alongside it.

### Step 9 — Deliver
Present the full folder (SVGs, exported PNG/ICO/app-icon sets, animated file if made, and a one-page spec sheet summarizing min-size/clear-space/palette). Mention any gate the pipeline had to skip due to a missing tool, and what installing it would unlock.

## Reference files (read on demand, not all up front)

- `references/design-principles.md` — grid systems, golden-ratio/φ construction, negative-space technique, typography/kerning discipline, color restraint. Read before generating any candidate (Step 3).
- `references/anti-patterns.md` — the cliché/"slop" catalog (gradient blobs, swirling-hexagon, swoosh-over-text, generic shield, overused fonts) that both the gate script and the critique check against. Read at Step 2 and whenever a gate fails to understand *why*.
- `references/taste-system.md` — canonical design-language anchors, style dials (φ vs 1:1 vs 3:2), default banned-motif list. Read at Step 2.
- `references/deliverable-spec.md` — the full variant/manifest checklist and brand-guideline structure. Read at Step 7.
- `references/animation-guide.md` — stroke-draw, morph, kinetic-type, and Lottie techniques with code patterns and a format decision matrix. Read at Step 8, only if animation is in scope.

## Scripts

- `scripts/lf_slop.py` — deterministic SVG hygiene + cliché-shape + doodle-complexity gate. Stdlib only (no install needed).
- `scripts/lf_color.py` — palette/color-count conformance + optional legibility-at-size check (uses `rsvg-convert`/`resvg`/Inkscape if present on PATH; degrades gracefully with an explicit warning if none are found — never silently skips).
- `scripts/lf_export.py` — multi-format export orchestration (PNG size matrix, hand-built `.ico` via pure-Python packing, app-icon size sets). Requires one external rasterizer on PATH for the raster step; the `.ico` packing itself has no dependency.

## Assets

- `assets/BRAND.spec.template.md` — the spec file template. Copy it into the project as `BRAND.spec.md` at Step 0 and fill it in; every gate reads this file, not the conversation.
