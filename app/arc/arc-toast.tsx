"use client";

// Toast in the manner of arc-library's Toast (MIT, see LICENSE-arc-library.txt): it rises on a spring, the check draws itself,
// a changed message swaps with a soft blur, and it sinks away when the message is cleared. The page decides when the message
// appears and goes (use-toast.ts owns the one timer); this only draws it. Clipbox adds action buttons (编辑, 撤销), an error
// tone (an exclamation mark in a red circle instead of the check, drawn the same way) and a fade: in the last part of its
// time the toast turns transparent (CSS, data-fading), and it tells the page when the pointer or keyboard focus is on it
// (onHold) so the time stops and it is fully visible again.
import { useEffect, useRef, type CSSProperties, type FocusEvent, type ReactNode } from "react";
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

export type ArcToastAction = { label: string; onClick: () => void; variant?: "primary" | "secondary" };

export function ArcToast({ message, actions, className, tone = "ok", fading = false, fadeMs = 0, onHold }: {
  message: string;
  actions?: ArcToastAction[];
  className?: string;
  tone?: "ok" | "error";
  fading?: boolean;
  fadeMs?: number;
  onHold?: (held: boolean) => void;
}) {
  // Pointer and keyboard focus each hold the toast; it lets go when neither is on it. A mouse click also focuses the
  // button, so only focus a key moved there (:focus-visible) counts, or a clicked toast would never leave.
  const hover = useRef(false);
  const focus = useRef(false);
  const held = useRef(false);
  const sync = () => {
    const next = hover.current || focus.current;
    if (next === held.current) return;
    held.current = next;
    onHold?.(next);
  };
  useEffect(() => {
    if (!message) { hover.current = false; focus.current = false; held.current = false; }
  }, [message]);
  const onFocus = (event: FocusEvent<HTMLDivElement>) => { focus.current = event.target.matches(":focus-visible"); sync(); };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    focus.current = false;
    sync();
  };
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
          // motion moves the outer layer in and out; the inner .toast does the slow fade, so the two never fight over opacity.
          <motion.div key="toast" className="toast-motion" variants={variants} initial="hidden" animate="shown" exit="exit">
            <div className={`toast${tone === "error" ? " error" : ""}${actions?.length ? " has-actions" : ""}${className ? ` ${className}` : ""}`} data-tone={tone} data-fading={fading ? "" : undefined} style={{ "--toast-fade": `${fadeMs}ms` } as CSSProperties} onPointerEnter={(event) => { if (event.pointerType !== "touch") { hover.current = true; sync(); } }} onPointerLeave={() => { hover.current = false; sync(); }} onFocus={onFocus} onBlur={onBlur}>
              <div className="toast-body" role="status" aria-live="polite" aria-atomic="true">
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
              </div>
              {actions && actions.length > 0 && <span className="toast-actions">
                {actions.map((action) => <button key={action.label} type="button" className={`toast-action ${action.variant === "primary" ? "primary" : "secondary"}`} onClick={action.onClick}>{action.label}</button>)}
              </span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
