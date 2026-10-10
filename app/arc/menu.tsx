"use client";

// Pop-over menu motion in the arc-library style (D-021, step 3). Menus open many times a day, so the motion is short and
// small: a quick fade with a 3% scale from the corner next to the button, and an even quicker fade out. No blur, no
// stagger. Wrap the conditional render in <AnimatePresence> so the exit can play; under reduced motion nothing moves.
import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "./motion-tokens";

export function ArcMenu({ className, origin = "top right", label, style, children }: {
  className: string; origin?: string; label?: string; style?: CSSProperties; children: ReactNode;
}) {
  const reduced = useReducedMotion() ?? false;
  const still = { duration: 0 };
  return (
    <motion.div
      className={className}
      role="menu"
      aria-label={label}
      style={{ ...style, transformOrigin: origin }}
      initial={reduced ? false : { opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: reduced ? still : { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.enter] } }}
      exit={{ opacity: 0, scale: reduced ? 1 : 0.98, transition: reduced ? still : { duration: motionTokens.duration.instant - 0.02, ease: [...motionTokens.ease.standard] } }}
    >
      {children}
    </motion.div>
  );
}
