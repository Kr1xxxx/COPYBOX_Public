# Design Principles — What Makes a Mark Read as Premium

Read this before generating any candidate SVG. These are the construction disciplines that separate a professional mark from a freehand one — they're also what the gate scripts try to verify mechanically, so following them here is what makes Step 4 pass on the first try instead of the third.

## 1. Build on an explicit grid — never freehand

Every professional mark is constructed on a declared geometric scaffold, not drawn by eye. Pick one before placing a single point:

- **Golden-ratio circle grid** — largest circle sets the outer boundary; progressively smaller circles (ratio ≈ 1.618) set internal curves, radii, and spacing. Fibonacci whole-number approximations (3:5, 5:8, 13:21) are practical stand-ins when you want ratio-consistency without irrational numbers in your path math.
- **1:1 grid** — signals stability/reliability. Good default when the brief doesn't call for "timeless/classical."
- **3:2 grid** — editorial weight, slightly more dynamic than 1:1.
- **Isometric (30°) grid** — pseudo-3D without true perspective distortion; good for geometric-abstract directions.
- **Hexagonal grid** — implies modularity/movement.

Practical note: which grid you pick matters less than that you pick one and stay on it. A mark where every stroke width, corner radius, and gap is a multiple of one module reads as intentional even with simple geometry. `lf_slop.py` checks stroke-width consistency as a proxy for "was this actually gridded."

## 2. Negative space (hardest technique, biggest payoff)

Hide a second, relevant shape in the counterspace between glyphs or inside a letterform (the classic reference is the arrow hidden in the kerning of a well-known shipping wordmark, or a silhouette hidden inside a repeated letter). This is genuinely hard to construct procedurally — it usually needs deliberate, iterative placement rather than a formula. Don't force it: if the negative-space direction (Step 3, candidate 3) doesn't land cleanly, it's fine for it to be the weakest of the five candidates. A forced, unclear negative-space hack is worse than skipping it.

## 3. Typography discipline (for wordmark/monogram directions)

- One type family, used with intent — not the default weight/tracking straight out of the box. Adjust kerning and letter-spacing by hand; tighten until it's dense but still legible.
- Avoid the overused defaults (see `anti-patterns.md` for the current list) — using the same three fonts every AI-assisted project reaches for is one of the most detectable tells.
- Custom letterform modification (cutting a serif, squaring a curve, connecting two letters) reads as intentional; unmodified system fonts read as a placeholder.

## 4. Color restraint

- Default to 1–2 colors. A mark that only works with a gradient or a third accent color usually isn't resolved yet — it's leaning on color to do work the shape should be doing.
- The mark must survive **single-color (black) and reversed (white-on-dark)** use without redesign. If it doesn't, the shape isn't finished.
- Pre-paired palettes beat free-form hex picking. If the brief doesn't lock colors, pick from a small set of tested pairings rather than generating hex codes ad hoc.

## 5. The flat black-and-white test

Strip all color, render fill:#000 on white. If the mark collapses into an indistinct blob, it fails — regardless of how good it looks in color. This is the single most reliable "premium vs. AI-slop" discriminator documented by working designers, and it's mechanical enough that `lf_color.py --legibility-check` can automate it when a rasterizer is available. Run it manually if not.

## 6. Legibility at favicon scale

The mark must read at 16×16px. If fine detail disappears or the silhouette becomes ambiguous, either the mark has too many elements for an icon (route the detail into the wordmark/primary lockup instead and keep the icon reduced), or it needs a dedicated small-use variant (see `deliverable-spec.md` — some brands ship a purpose-drawn tiny-size mark rather than just scaling down the primary one).

## 7. Silhouette distinctiveness

A good mark has a recognizable outline even as a solid black shape with no internal detail. If two candidates from Step 3 have near-identical silhouettes, they're not actually distinct directions — regenerate one of them rather than presenting two variations on the same idea as if they were options.

## Summary checklist (mirrors what the gate checks mechanically)

- [ ] Built on one declared grid; strokes/radii/gaps are multiples of one module
- [ ] ≤2 colors, survives flat-black and reversed use
- [ ] No gradient unless explicitly permitted by the taste system for this run
- [ ] Distinct, recognizable silhouette at 16px
- [ ] One type family if a wordmark is involved, kerning adjusted by hand
- [ ] Self-contained SVG — no external fonts, images, or scripts
