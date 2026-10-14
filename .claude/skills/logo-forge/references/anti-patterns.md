# Anti-Patterns — The Logo "Slop" Catalog

This is the logo-specific equivalent of a UI anti-pattern catalog: a list of overused, low-effort, or AI-tell motifs to actively avoid. `lf_slop.py` checks for the structurally-detectable ones (gradients on circular blobs, generic-swoosh path shapes, overused fonts if font-family is inline). The rest are judgment calls for the critique step (Step 6). Read this before Step 2 (taste lock) and again any time a gate fails, to understand what tripped it.

## Structural clichés (what the gate can catch)

1. **The circular gradient / "swirling hexagon" blob.** A near-circular shape, gradient fill (radial or linear), a central opening or focal point, and radiating internal elements. This is the dominant AI-company-logo trope as of 2025–2026 — documented across multiple design-critique sources analyzing real company marks. If a candidate is circular *and* uses a gradient *and* has radiating/petal-like internal shapes, it's this cliché. Regenerate with a flat fill and a different base shape.
2. **The generic swoosh.** A single sweeping curved stroke, usually crossing or underlining text, meant to imply motion/speed/innovation with no other content. If a path's dominant feature is one long bezier swoop and nothing else, it's a swoosh — this is a low-effort filler, not a resolved mark.
3. **Gradient-over-everything.** Reaching for a gradient to make a simple shape feel more "premium" instead of resolving the shape itself. A mark that only looks finished with a gradient applied isn't finished.
4. **Generic shield / badge outline** used as a container for unrelated content, signaling "trust" with no connection to the actual niche.
5. **Blue circle, checkmark, or lightbulb** used as the entire concept with no niche-specific adaptation — these are the "default nouns" of logo design and read as templated regardless of execution quality.
6. **V-man / abstract-person-as-checkmark** — an abstract human figure built from 2–3 geometric strokes, used across unrelated brands as a generic "growth/achievement" symbol.

## Typography clichés

7. **Overused AI-default fonts** used unmodified — the same 3–4 typefaces (geometric grotesques that show up disproportionately in AI-assisted design output) at default weight/tracking. Using one of these isn't automatically wrong, but using it with zero kerning/weight adjustment is the tell, not the font choice itself.
8. **Flat, undifferentiated hierarchy** — wordmark and any tagline/descriptor set at the same weight and size with no visual hierarchy.
9. **Crushed or default letter-spacing** — tracking left at the type family's default rather than adjusted for the specific word/mark.

## Construction clichés

10. **Amateurish hand-drawn illustration** — a mascot or scene rendered as loose, illustrative SVG paths rather than constructed geometry. This reads as a doodle, not a mark. `lf_slop.py`'s path-count heuristic flags a high path count on a "mark"-tagged file as a proxy for this.
11. **No grid, freehand curves** — organic-looking but actually just unconstrained; usually visible as inconsistent stroke widths and non-repeating radii. `lf_slop.py` checks stroke-width variance as a proxy.
12. **Icon-next-to-text assembly** — a generic stock-style icon placed beside a wordmark with no shared geometry, color, or conceptual link between the two. If the icon would be equally at home next to a completely different company's name, it's this.

## Color clichés

13. **Purple-to-blue or teal-to-blue gradient** as a default "tech" palette with no other justification.
14. **Neon-on-dark** as a default "modern/AI" palette applied regardless of niche.
15. **More than 2 colors with no locked palette rationale** — color added to compensate for an unresolved shape (see design-principles.md §4).

## The "another tech logo" trap

The single biggest anti-pattern is anchoring every direction to *other logos in the same broad category* (other SaaS companies, other AI companies) rather than to something concrete from the actual niche or to a named design movement. If the honest answer to "what did I look at for reference" is "other companies like us," restart the anchor step. Anchor instead to:
- A real, concrete object from the niche (a tool, an ingredient, a landmark, an action) — see design-principles.md.
- A named design movement (Bauhaus, Swiss International/International Typographic Style, Memphis, mid-century modern, constructivism) applied deliberately, not decoratively.

## Using this list

- Steps 2–3: pick an anchor and banned-motif set that actively rules several of these out for this run — write the chosen bans into `BRAND.spec.md` so the gate can check for them.
- Step 4: `lf_slop.py` flags items 1–2 (shape heuristics) and 7, 10–11 (structural heuristics) automatically. A flag here doesn't necessarily mean discard — read the specific violation and judge whether it's a false positive (e.g., a genuinely justified radial element that isn't the blob cliché) versus a real hit.
- Step 6: the rest (3–6, 8–9, 12–15) are critique-stage judgment calls — score each surviving candidate against this list explicitly rather than only against a vague "does it look good."
