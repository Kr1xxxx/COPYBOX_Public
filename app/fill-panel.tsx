"use client";

import { useEffect, useState, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SecretItem } from "./clipbox-core";
import { DEFAULT_VALUES } from "./variable-memory";

export type CopyLanguage = "en" | "zh";
export type SnippetFillState = {
  itemId: string;
  language: CopyLanguage;
  values: Record<string, string>;
  checkedInputs: string[];
  verificationConfirmed: boolean;
  /** Variables that were prefilled from the last copy and not touched yet. */
  remembered: string[];
};

// Values typed for earlier copies are offered again, so a variable that repeats (a company, a country) needs no retyping.
export function emptyFillState(item: SecretItem, remembered: Record<string, string> = {}, language: CopyLanguage = "en"): SnippetFillState {
  const values: Record<string, string> = {};
  for (const name of item.snippetMeta?.placeholders || []) if (remembered[name]) values[name] = remembered[name];
  const carried = Object.keys(values);
  // Name starts as Friend, so a reply with no choice made still goes out. This is not a carried-over value: it needs no second look.
  for (const name of item.snippetMeta?.placeholders || []) if (!values[name] && DEFAULT_VALUES[name]) values[name] = DEFAULT_VALUES[name];
  return { itemId: item.id, language, values, checkedInputs: [], verificationConfirmed: false, remembered: carried };
}

// A variable shows as a highlighted block without its brackets. Static in the collapsed list, a field in the open card.
export function SnippetVariableText({ text, renderText, values, remembered, onChange, onEnter, onActive, onFocusChange, onPin, isPinned }: {
  text: string;
  renderText: (text: string) => ReactNode;
  values?: Record<string, string>;
  remembered?: string[];
  onChange?: (name: string, value: string) => void;
  onEnter?: (name: string) => void;
  onActive?: (name: string | null) => void;
  onFocusChange?: (focused: boolean) => void;
  onPin?: (name: string) => void;
  isPinned?: (name: string) => boolean;
}) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return <>{parts.map((part, index) => {
    const match = /^\[([^\]]+)\]$/.exec(part);
    if (!match) return <span key={index}>{renderText(part)}</span>;
    const name = match[1].trim();
    if (!values || !onChange) return <mark key={index} className="snippet-variable">{renderText(name)}</mark>;
    const value = values[name] || "";
    return (
      <span key={index} className="var-chip" data-filled={value ? "" : undefined} data-remembered={remembered?.includes(name) ? "" : undefined} data-pinned={isPinned?.(name) ? "" : undefined} onContextMenu={(event) => { if (!onPin) return; event.preventDefault(); onPin(name); }} title={remembered?.includes(name) ? "上次填的，点一下可以改" : undefined}>
        {/* The hidden copy of the text gives the field its width, so the block grows while you type. */}
        <span className="var-sizer" aria-hidden="true">{value || name}</span>
        <input
          value={value}
          data-var={name}
          placeholder={name}
          aria-label={`变量 ${name}`}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(name, event.target.value)}
          onFocus={(event) => { onFocusChange?.(true); onActive?.(name); event.currentTarget.select(); }}
          onBlur={(event) => { onFocusChange?.(false); onActive?.(null); event.currentTarget.scrollLeft = 0; }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); onEnter?.(name); }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); }
          }}
        />
      </span>
    );
  })}</>;
}

export function SnippetFill({ item, state, onState, renderText, onSubmit, onActive, onFocusChange, onPin, isPinned }: {
  item: SecretItem;
  state: SnippetFillState;
  onState: (update: (current: SnippetFillState) => SnippetFillState) => void;
  renderText: (text: string) => ReactNode;
  onSubmit: () => void;
  onActive: (name: string | null) => void;
  onFocusChange: (focused: boolean) => void;
  onPin: (name: string) => void;
  isPinned: (name: string) => boolean;
}) {
  const meta = item.snippetMeta!;
  const rootRef = useRef<HTMLDivElement>(null);
  const source = state.language === "zh" ? meta.chineseText : item.secret;

  // Enter moves to the next empty block; when all are filled it copies.
  function next(name: string) {
    const chips = Array.from(rootRef.current?.querySelectorAll<HTMLInputElement>("input[data-var]") || []);
    const start = chips.findIndex((chip) => chip.dataset.var === name);
    const target = [...chips.slice(start + 1), ...chips.slice(0, start)].find((chip) => !chip.value.trim());
    if (target) target.focus(); else onSubmit();
  }

  return (
    <div ref={rootRef} className="snippet-fill">
      {meta.chineseText && <div className="copy-language" role="group" aria-label="复制语言">
        <button type="button" className={state.language === "en" ? "active" : ""} onClick={() => onState((current) => ({ ...current, language: "en" }))}>英文</button>
        <button type="button" className={state.language === "zh" ? "active" : ""} onClick={() => onState((current) => ({ ...current, language: "zh" }))}>中文</button>
      </div>}
      <p className="row-content" lang={state.language === "zh" ? "zh" : "en"}>
        <SnippetVariableText
          text={source}
          renderText={renderText}
          values={state.values}
          remembered={state.remembered}
          onActive={onActive}
          onChange={(name, value) => onState((current) => ({ ...current, values: { ...current.values, [name]: value }, remembered: current.remembered.filter((entry) => entry !== name) }))}
          onEnter={next}
          onFocusChange={onFocusChange}
          onPin={onPin}
          isPinned={isPinned}
        />
      </p>
      {meta.requiredInputs.length > 0 && <fieldset className="copy-checks"><legend>发送前确认</legend>{meta.requiredInputs.map((input) => <label key={input}><input type="checkbox" checked={state.checkedInputs.includes(input)} onChange={(event) => onState((current) => ({ ...current, checkedInputs: event.target.checked ? [...current.checkedInputs, input] : current.checkedInputs.filter((value) => value !== input) }))} /><span>已确认 {input}</span></label>)}</fieldset>}
      {meta.requiresVerification && <label className="copy-warning"><input type="checkbox" checked={state.verificationConfirmed} onChange={(event) => onState((current) => ({ ...current, verificationConfirmed: event.target.checked }))} /><span><strong>发送前核实</strong> 金额、库存、地址或时效已按当前情况检查</span></label>}
    </div>
  );
}

// The choices for a block, shown above it while it is focused. Drawn in the page body so no card can clip it.
export function VariablePopup({ rowId, name, options, current, onPick }: { rowId: string; name: string; options: readonly string[]; current: string; onPick: (value: string) => void }) {
  const [box, setBox] = useState<{ left: number; top: number; below: boolean } | null>(null);
  useEffect(() => {
    const place = () => {
      const input = document.querySelector(`[data-sort-id="${CSS.escape(rowId)}"] input[data-var="${CSS.escape(name)}"]`);
      const rect = input?.closest(".var-chip")?.getBoundingClientRect();
      // Above the block, unless the card has the 英文/中文 switch: that sits right over the text, so the choices open below.
      const below = Boolean(input?.closest(".snippet-fill")?.querySelector(".copy-language"));
      setBox(rect ? { left: rect.left + rect.width / 2, top: below ? rect.bottom : rect.top, below } : null);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [rowId, name]);
  if (!box || typeof document === "undefined") return null;
  return createPortal(
    <div className="var-popup" data-below={box.below ? "" : undefined} role="listbox" aria-label={`${name} 常用`} style={{ left: box.left, top: box.top }}>
      {options.map((option) => <button key={option} type="button" role="option" aria-selected={option === current} className="var-popup-option" onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(option)}>{option}</button>)}
    </div>,
    document.body,
  );
}

// The menu on a remembered value: pin, unpin, delete. Drawn in the page body at the pointer.
export function VariableMenu({ x, y, pinned, onPin, onUnpin, onDelete, onClose }: { x: number; y: number; pinned: boolean; onPin: () => void; onUnpin: () => void; onDelete: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (event: Event) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", onClose, true);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", key); window.removeEventListener("scroll", onClose, true); };
  }, [onClose]);
  if (typeof document === "undefined") return null;
  const item = (label: string, enabled: boolean, run: () => void, danger = false) => (
    <button type="button" role="menuitem" disabled={!enabled} className={danger ? "danger" : undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => { run(); onClose(); }}>{label}</button>
  );
  return createPortal(
    <div ref={ref} className="var-menu" role="menu" aria-label="常用值" style={{ left: Math.min(x, window.innerWidth - 120), top: Math.min(y, window.innerHeight - 130) }}>
      {item("固定", !pinned, onPin)}
      {item("解锁", pinned, onUnpin)}
      {item("删除", true, onDelete, true)}
    </div>,
    document.body,
  );
}
