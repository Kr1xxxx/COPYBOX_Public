"use client";

// The "松开即可添加图片" overlay while files are dragged over the list (D-021, step 4). A drag happens a few times a day, so it
// may be visible: a quick fade with a 1.5% scale, and a quicker fade out. Wrap in <AnimatePresence>; nothing moves under
// reduced motion.
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "./motion-tokens";

export function ArcDropHint({ className, children }: { className: string; children: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  const still = { duration: 0 };
  return (
    <motion.div
      className={className}
      aria-hidden="true"
      initial={reduced ? false : { opacity: 0, scale: 0.985 }}
      animate={{ opacity: 0.94, scale: 1, transition: reduced ? still : { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.enter] } }}
      exit={{ opacity: 0, transition: reduced ? still : { duration: motionTokens.duration.instant, ease: [...motionTokens.ease.standard] } }}
    >
      {children}
    </motion.div>
  );
}
