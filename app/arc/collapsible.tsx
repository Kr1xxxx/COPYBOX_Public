"use client";

// One item of arc-library's Accordion (MIT, see LICENSE-arc-library.txt): the panel height follows its content on a spring
// that never overshoots, the content settles down with a brief focus pull, and the chevron turns on a snappy spring.
// Clipbox needs single, independent sections, so the Radix root is replaced by a plain button with aria-expanded;
// the header row keeps room for the caller's own content (a count, a button). Collapsed by default.
import { useId, useState, type ReactNode } from "react";
import { motion, useReducedMotion, type TargetAndTransition, type Variants } from "motion/react";
import { motionTokens } from "./motion-tokens";

const panelOpen: TargetAndTransition = { height: "auto", opacity: 1, visibility: "visible" };
const panelClosed: TargetAndTransition = { height: 0, opacity: 0, transitionEnd: { visibility: "hidden" } };
const contentOpen: TargetAndTransition = { y: 0 };
const contentClosed: TargetAndTransition = { y: -6 };
const panelMotion: Variants = {
  open: { ...panelOpen, transition: { height: motionTokens.spring.smooth, opacity: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] } } },
  closed: { ...panelClosed, transition: { height: motionTokens.spring.smooth, opacity: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] } } },
};
const contentMotion: Variants = {
  open: { ...contentOpen, transition: { y: motionTokens.spring.smooth } },
  closed: { ...contentClosed, transition: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] } },
};
const panelStill: Variants = { open: { ...panelOpen, transition: { duration: 0 } }, closed: { ...panelClosed, transition: { duration: 0 } } };
const contentStill: Variants = { open: { ...contentOpen, transition: { duration: 0 } }, closed: { ...contentClosed, transition: { duration: 0 } } };

export function ArcCollapsible({ title, meta, className = "", defaultOpen = false, children }: {
  title: ReactNode; meta?: ReactNode; className?: string; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduced = useReducedMotion() ?? false;
  const panelId = useId();
  return (
    <div className={`arc-collapsible ${open ? "open" : ""} ${className}`}>
      <button type="button" className="arc-collapsible-trigger" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
        <span className="arc-collapsible-title">{title}</span>
        {meta !== undefined && <small className="arc-collapsible-meta">{meta}</small>}
        <motion.span className="arc-collapsible-icon" aria-hidden="true" initial={false} animate={{ rotate: open ? 180 : 0 }} transition={reduced ? { duration: 0 } : motionTokens.spring.snappy}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </motion.span>
      </button>
      {/* Closed panels stay mounted (state such as a half-typed name survives) but are hidden and inert. */}
      <motion.div id={panelId} role="region" className="arc-collapsible-panel" inert={!open} initial={false} animate={open ? "open" : "closed"} variants={reduced ? panelStill : panelMotion}>
        <motion.div className="arc-collapsible-inner" variants={reduced ? contentStill : contentMotion}>{children}</motion.div>
      </motion.div>
    </div>
  );
}
