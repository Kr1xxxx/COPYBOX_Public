"use client";

// The copy icon of arc-library's CopyButton (MIT, see LICENSE-arc-library.txt): the clipboard glyph shrinks into a soft blur
// while the check grows out of it and draws itself. Clipbox keeps its own buttons (copying is done by the caller), so this is
// only the icon. Plain inline styles, no CSS module.
import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition, type Transition } from "motion/react";
import { motionTokens } from "./motion-tokens";

const soft = `blur(${motionTokens.blur.soft}px)`;
const rest: TargetAndTransition = { opacity: 1, scale: 1, filter: "blur(0px)" };
const iconIn: TargetAndTransition = { opacity: 0, scale: 0.6, filter: soft };
const settle = { type: "spring", visualDuration: 0.5, bounce: 0.06 } as const;
const enter = { duration: 0.36, ease: [...motionTokens.ease.enter] } as const;
const iconEnter: Transition = { scale: settle, opacity: { ...enter, delay: 0.03 }, filter: { ...enter, delay: 0.03 } };
const iconOut: TargetAndTransition = { opacity: 0, scale: 0.6, filter: soft, transition: { duration: 0.24, ease: [...motionTokens.ease.standard] } };
const instant = { duration: motionTokens.duration.instant } as const;

export function ArcCopyIcon({ copied, size = 16 }: { copied: boolean; size?: number }) {
  const reduced = useReducedMotion() ?? false;
  const state = copied ? "copied" : "idle";
  return (
    <span className="arc-copy-icon" aria-hidden="true" style={{ position: "relative", display: "grid", width: size, height: size, flex: "none" }}>
      <AnimatePresence initial={false}>
        <motion.span
          key={state}
          data-state={state}
          style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}
          initial={reduced ? { opacity: 0 } : iconIn}
          animate={rest}
          exit={reduced ? { opacity: 0, transition: instant } : iconOut}
          transition={reduced ? instant : iconEnter}
        >
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" focusable="false">
            {copied
              ? <motion.path d="M4 12l5 5L20 6" initial={reduced ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ pathLength: { duration: 0.5, ease: [...motionTokens.ease.standard], delay: 0.05 }, opacity: { duration: 0.01, delay: 0.05 } }} />
              : <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>}
          </svg>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
