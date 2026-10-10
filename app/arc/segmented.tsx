"use client";

// A segmented control in the style of arc-library's SegmentedControl (MIT, see LICENSE-arc-library.txt): the highlight is one
// pill that glides from the old option to the new one (shared layout), instead of each button flashing its own background.
// Kept deliberately small for a high-frequency control: no bounce, no blur, and no motion at all under reduced-motion.
// The markup keeps the app's existing classes (`active`, `aria-pressed` / `aria-checked`), so styles and tests stay as they were.
import { useId, type ReactNode } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";

export type ArcSegment = { value: string; label: ReactNode; ariaLabel?: string; title?: string };

export function ArcSegmented({ options, value, onSelect, className, label, mode = "pressed", role }: {
  options: ArcSegment[];
  // The value of the selected option; use "" when none of them is selected.
  value: string;
  onSelect: (value: string) => void;
  className?: string;
  label: string;
  // "pressed": buttons with aria-pressed (default). "radio": a radiogroup with aria-checked.
  mode?: "pressed" | "radio";
  role?: string;
}) {
  const id = useId();
  const reduced = useReducedMotion();
  return (
    <div className={`arc-seg ${className ?? ""}`} role={role ?? (mode === "radio" ? "radiogroup" : "group")} aria-label={label}>
      <LayoutGroup id={id}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              {...(mode === "radio" ? { role: "radio", "aria-checked": active } : { "aria-pressed": active })}
              className={active ? "active" : ""}
              aria-label={option.ariaLabel}
              title={option.title}
              onClick={() => onSelect(option.value)}
            >
              {active && <motion.span className="arc-seg-pill" layoutId="pill" transition={reduced ? { duration: 0 } : { type: "spring", visualDuration: 0.22, bounce: 0 }} aria-hidden="true" />}
              <span className="arc-seg-label">{option.label}</span>
            </button>
          );
        })}
      </LayoutGroup>
    </div>
  );
}
