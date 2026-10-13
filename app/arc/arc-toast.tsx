"use client";

// Toast in the manner of arc-library's Toast (MIT, see LICENSE-arc-library.txt): it rises on a spring, the check draws itself,
// a changed message swaps with a soft blur, and it sinks away when the message is cleared. The page decides when the message
// appears and goes (use-toast.ts owns the one timer); this only draws it. Clipbox adds an optional action button (撤销) and
// an error tone: an exclamation mark in a red circle instead of the check, drawn the same way.
import type { ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type HTMLMotionProps, type TargetAndTransition, type Variants } from "motion/react";
import { motionTokens } from "./motion-tokens";

const enter = { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] } as const;
const exitFast = { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] } as const;
const textIn: TargetAndTransition = { opacity: 0, y: "0.3em", filter: `blur(${motionTokens.blur.soft}px)` };
const textOut: TargetAndTransition = { opacity: 0, y: "-0.3em", filter: `blur(${motionTokens.blur.subtle}px)`, transition: exitFast };
const textShown: TargetAndTransition = { opacity: 1, y: "0em", filter: "blur(0px)" };

// The outgoing copy is hidden from assistive tech while it fades, so the live region reads only the current text.
function Swap(props: HTMLMotionProps<"span">) {
  const present = useIsPresent();
  return <motion.span {...props} aria-hidden={present ? props["aria-hidden"] : true} />;
}

export function ArcToast({ message, action, className, tone = "ok" }: { message: string; action?: { label: string; onClick: () => void }; className?: string; tone?: "ok" | "error" }) {
  const reduce = useReducedMotion();
  const variants: Variants = reduce
    ? { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: motionTokens.duration.instant } }, exit: { opacity: 0, transition: { duration: motionTokens.duration.instant } } }
    : {
      hidden: { opacity: 0, y: 16, scale: 0.96 },
      shown: { opacity: 1, y: 0, scale: 1, transition: { ...motionTokens.spring.morph, opacity: enter } },
      exit: { opacity: 0, y: 8, scale: 0.97, transition: { duration: motionTokens.duration.exit, ease: [...motionTokens.ease.standard] } },
    };
  const swap = { initial: reduce ? { opacity: 0 } : textIn, animate: textShown, exit: reduce ? { opacity: 0, transition: { duration: motionTokens.duration.instant } } : textOut, transition: reduce ? { duration: motionTokens.duration.instant } : enter };
  const content: ReactNode = message;
  const draw = { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter], delay: 0.12 } as const;
  return (
    <div className="toast-host">
      <AnimatePresence>
        {message && (
          <motion.div key="toast" className={`toast${tone === "error" ? " error" : ""}${className ? ` ${className}` : ""}`} data-tone={tone} role="status" aria-live="polite" aria-atomic="true" variants={variants} initial="hidden" animate="shown" exit="exit">
            <span className="toast-icon" aria-hidden="true">
              {/* Keyed by tone: when a message of the other kind replaces this one, the new mark draws itself again. */}
              <svg key={tone} width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
                {tone === "error" ? (
                  <>
                    <motion.path className="toast-mark-error" d="M12 5.5v8" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={draw} />
                    <motion.circle cx={12} cy={18.5} r={1.4} fill="currentColor" stroke="none" initial={reduce ? false : { opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...draw, delay: 0.24 }} />
                  </>
                ) : (
                  <motion.path className="toast-mark-ok" d="M4 12.5l5 5L20 6.5" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={draw} />
                )}
              </svg>
            </span>
            <span className="toast-text">
              <AnimatePresence mode="popLayout" initial={false}>
                <Swap key={message} className="toast-line" {...swap}>{content}</Swap>
              </AnimatePresence>
            </span>
            {action && <button type="button" onClick={action.onClick}>{action.label}</button>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
