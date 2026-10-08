# Clipbox Dual Skill Concepts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce two polished `1360 × 1240` PNG mockups of the current Clipbox home screen, one directed by Taste Skill and one by Open Design.

**Architecture:** Keep the production application untouched. Create two visual-philosophy Markdown files, render each concept from a temporary vector composition, export PNG artifacts into `design/concepts/`, then inspect the full-size and `680 × 620` presentations before delivery.

**Tech Stack:** SVG/CSS temporary render sources, Chromium screenshot rendering, PNG output, macOS system fonts, local visual inspection.

## Global Constraints

- Do not modify `app/`, `desktop/`, storage formats, encryption, or behavior.
- Final mockups must both be exactly `1360 × 1240` pixels.
- Both concepts must show the same “话术 / 售后” content and preserve the same product structure.
- Final workspace deliverables are PNG and Markdown only; temporary rendering sources must be removed.
- Taste Skill concept uses `DESIGN_VARIANCE: 5`, `MOTION_INTENSITY: 4`, `VISUAL_DENSITY: 7`.
- Taste Skill concept uses warm-white content, graphite navigation, amber snippet accent, and semantic green only for copied state.
- Open Design concept uses a tokenized light productivity system with stable component geometry and explicit state styling.
- No AI-purple gradients, glass-card stacks, decorative status dots, oversized empty space, clipped text, or overlapping controls.
- Perform a deliberate refinement pass after the first render.

---

### Task 1: Visual philosophies and shared content contract

**Files:**
- Create: `design/concepts/taste-editorial-utility.md`
- Create: `design/concepts/open-calm-operational.md`

**Interfaces:**
- Consumes: the approved specification at `docs/superpowers/specs/2026-08-13-clipbox-dual-skill-concepts-design.md`.
- Produces: two philosophy files and one shared visible-content contract embedded in both files.

- [ ] **Step 1: Write the Taste Skill visual philosophy**

Define “Editorial Utility” in 4-6 concise paragraphs covering graphite/warm-white contrast, ledger rhythm, amber accent, compact hierarchy, and master-level alignment craft.

- [ ] **Step 2: Write the Open Design visual philosophy**

Define “Calm Operational” in 4-6 concise paragraphs covering semantic tokens, light surfaces, stable columns, restrained blue-violet selection color, and accessible feedback.

- [ ] **Step 3: Lock identical visible content**

Use exactly these five items in both concepts:

```text
售后夸赞 / 夸赞客户美照 / 置顶
物流延迟 / 物流进度回复 / 已复制
护理提醒 / 日常护理提醒
补发确认 / 补发安排确认
回访邀请 / 邀请客户回访
```

- [ ] **Step 4: Validate the philosophy artifacts**

Run:

```bash
test -s design/concepts/taste-editorial-utility.md
test -s design/concepts/open-calm-operational.md
rg -n 'Editorial Utility|Calm Operational' design/concepts/*.md
```

Expected: both files exist and each named movement is found.

### Task 2: Taste Skill concept render

**Files:**
- Create temporarily: `design/concepts/.render/taste-concept.svg`
- Create: `design/concepts/clipbox-taste-skill.png`
- Remove after export: `design/concepts/.render/taste-concept.svg`

**Interfaces:**
- Consumes: `design/concepts/taste-editorial-utility.md` and the shared content contract.
- Produces: `design/concepts/clipbox-taste-skill.png` at `1360 × 1240`.

- [ ] **Step 1: Compose the first-pass vector screen**

Build a `1360 × 1240` SVG with: 80px title bar; 286px graphite sidebar; segmented “秘密 / 话术” control; editorial directory index; compact search; five ledger rows; pinned and copied states; bottom-left settings; bottom-right add button.

- [ ] **Step 2: Render the first-pass PNG**

Serve the temporary source locally and capture at `1360 × 1240` with browser viewport and screenshot APIs.

- [ ] **Step 3: Perform the Taste Skill refinement pass**

Check and correct: single amber accent, consistent radii, title weight, 8px baseline rhythm, list density, copied-state green, control alignment, and absence of large card shadows.

- [ ] **Step 4: Re-render and remove the temporary source**

Export the refined PNG and remove the temporary SVG so only the PNG and philosophy Markdown remain.

### Task 3: Open Design concept render

**Files:**
- Create temporarily: `design/concepts/.render/open-design-concept.svg`
- Create: `design/concepts/clipbox-open-design.png`
- Remove after export: `design/concepts/.render/open-design-concept.svg`

**Interfaces:**
- Consumes: `design/concepts/open-calm-operational.md` and the shared content contract.
- Produces: `design/concepts/clipbox-open-design.png` at `1360 × 1240`.

- [ ] **Step 1: Compose the first-pass tokenized screen**

Build a `1360 × 1240` SVG with semantic surface, border, text, accent, success, radius, and spacing tokens expressed consistently across title bar, sidebar, segmented control, search, list rows, states, settings, and add button.

- [ ] **Step 2: Render the first-pass PNG**

Serve the temporary source locally and capture at `1360 × 1240` with browser viewport and screenshot APIs.

- [ ] **Step 3: Perform the Open Design refinement pass**

Check and correct: column stability, component reuse, search prominence, AA-readable text contrast, selected and copied states, 32px minimum operation targets in the 1x presentation, and consistent 10-12px 1x radii.

- [ ] **Step 4: Re-render and remove the temporary source**

Export the refined PNG and remove the temporary SVG so only the PNG and philosophy Markdown remain.

### Task 4: Visual QA and delivery

**Files:**
- Verify: `design/concepts/clipbox-taste-skill.png`
- Verify: `design/concepts/clipbox-open-design.png`

**Interfaces:**
- Consumes: both final PNGs.
- Produces: verified visual deliverables ready for side-by-side user review.

- [ ] **Step 1: Verify dimensions**

Run:

```bash
sips -g pixelWidth -g pixelHeight design/concepts/clipbox-taste-skill.png design/concepts/clipbox-open-design.png
```

Expected: both images report `pixelWidth: 1360` and `pixelHeight: 1240`.

- [ ] **Step 2: Inspect both at full size**

Open each PNG at original detail and check bounds, text clarity, visual hierarchy, repeated alignment, copied feedback, and equal content.

- [ ] **Step 3: Inspect both at common display size**

Create temporary `680 × 620` previews, inspect legibility and target clarity, then delete the temporary previews.

- [ ] **Step 4: Run artifact checks**

Run:

```bash
test -s design/concepts/clipbox-taste-skill.png
test -s design/concepts/clipbox-open-design.png
test ! -e design/concepts/.render/taste-concept.svg
test ! -e design/concepts/.render/open-design-concept.svg
```

Expected: both PNGs exist and temporary vector sources do not.

- [ ] **Step 5: Commit the visual deliverables**

```bash
git add design/concepts docs/superpowers/plans/2026-08-13-clipbox-dual-skill-concepts.md
git commit -m "design: add dual Clipbox UI concepts"
```
