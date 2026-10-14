# Animation Guide — Motion Marks

Read at Step 8, only when animation is in scope. Default to the first tier below unless the brief specifically needs something else — it's the only tier that's fully self-contained and hand-authorable directly in the SVG.

## Decision matrix

| Approach | File size | Compatibility | Hand-authorable by an agent | Best for |
|---|---|---|---|---|
| SMIL / CSS stroke-draw | Tiny, self-contained | Good in modern browsers | Yes — pure markup | Reveal/intro of a single mark |
| GSAP / anime.js / Motion One | Small + runtime | Excellent | Yes — plain JS | Richer sequencing, morphs, staggered draws |
| Lottie (Bodymovin JSON) | Larger JSON | Very wide (web/iOS/Android via lottie-web) | Hard — normally needs After Effects export | Cross-platform native playback |
| Rive (.riv) | Smallest, runtime ~50KB | Wide via runtimes | No — requires the Rive editor | Interactive/state-driven marks (out of scope for pure code generation) |

**Default recommendation: SMIL/CSS stroke-draw for the reveal, GSAP/anime.js if the brief wants more control. Only produce Lottie if cross-platform native playback is explicitly required, and generate it programmatically rather than trying to fake the JSON by hand. Treat Rive as out of scope — it needs its own editor.**

## Tier 1 — Stroke draw-on (default)

Set `stroke-dasharray` to the path's total length and `stroke-dashoffset` to the same value, then animate the offset to 0.

Pure CSS:
```css
path.reveal {
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: draw 1.6s ease forwards;
}
@keyframes draw {
  to { stroke-dashoffset: 0; }
}
```
Get the real path length at authoring time (don't guess 1000 — measure it or set `pathLength="100"` on the `<path>` element itself, which normalizes dash values to a 0–100 scale regardless of actual geometry, and use `stroke-dasharray: 100; stroke-dashoffset: 100;` universally).

This only animates the stroke, not the fill — the standard pattern is: draw the outline first, then cross-fade the fill in once the stroke completes (a second, delayed CSS animation on `fill-opacity`).

For multi-path marks, stagger the draw with `animation-delay` per path so it reads as one continuous gesture rather than everything drawing at once.

## Tier 2 — GSAP / anime.js

Use when you need: staggered draws across many paths without hand-tuning delays, drawing from the middle out instead of start-to-end, or a morph between two shapes.

**Path morphing — important caveat:** native/CSS interpolation and most JS morph libraries need the two paths to have the same number and type of path commands in the same order. Morphing between two of the Step-3 candidates that weren't authored from a shared base is unreliable — don't promise a clean morph between arbitrary candidates. If a morph is wanted, either:
- Author both endpoints from a shared node structure to begin with, or
- Use a library that auto-resamples segments to make arbitrary shapes morph-compatible (accept that smoothness trades off against segment density — more segments = smoother morph = more computed points).

## Tier 3 — Lottie (only if cross-platform playback is required)

Lottie is JSON describing keyframed vector animation, played back via `lottie-web` (or platform-native players on iOS/Android). It is normally produced by animating in After Effects and exporting via the Bodymovin plugin — there isn't a clean path to hand-author rich Lottie JSON directly. If this is genuinely required (e.g. the deliverable needs to play natively inside an iOS/Android app rather than a web view), generate the JSON programmatically from the same keyframe data driving the Tier 1/2 animation rather than trying to reverse-engineer a full After Effects-equivalent JSON by hand. Flag to the person that this tier costs meaningfully more effort than Tiers 1–2 and confirm it's actually needed before committing to it.

## Kinetic typography (wordmark-led animations)

If the wordmark itself is the animated element: animate one memorable gesture only (letters assembling from a scatter, a single letter transforming into the icon, tracking tightening from wide to final) — don't animate every letter independently with different timing, it reads as chaotic rather than premium. Resolve within ~2 seconds. Always ship a static final-frame fallback (for contexts that can't play animation) and consider a square + vertical crop if the animation will run across non-16:9 surfaces.

## Restraint checklist

- [ ] One gesture, not a sequence of unrelated effects
- [ ] Resolves in ~1.5–2.5s
- [ ] Ends on the exact static mark (no permanent motion/looping unless specifically requested, e.g. a loading indicator)
- [ ] Static fallback frame exists and matches the final animation frame exactly
- [ ] File is self-contained (Tier 1/2) or clearly flagged as needing the Lottie generation step (Tier 3)
