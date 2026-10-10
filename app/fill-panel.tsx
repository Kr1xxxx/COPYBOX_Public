"use client";

import { useRef, type ReactNode } from "react";
import type { SecretItem } from "./clipbox-core";

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
  return { itemId: item.id, language, values, checkedInputs: [], verificationConfirmed: false, remembered: Object.keys(values) };
}

export const MEMORY_SIZE = 3;

// The last few values used per variable name, newest first. Kept in memory only, never saved.
export type ValueMemory = Record<string, string[]>;
export function rememberValues(memory: ValueMemory, values: Record<string, string>): ValueMemory {
  const next = { ...memory };
  for (const [name, raw] of Object.entries(values)) {
    const value = raw.trim();
    if (value) next[name] = [value, ...(next[name] || []).filter((entry) => entry !== value)].slice(0, MEMORY_SIZE);
  }
  return next;
}
export function latestValues(memory: ValueMemory): Record<string, string> {
  return Object.fromEntries(Object.entries(memory).filter(([, list]) => list.length > 0).map(([name, list]) => [name, list[0]]));
}

// A variable shows as a highlighted block without its brackets. Static in the collapsed list, a field in the open card.
export function SnippetVariableText({ text, renderText, values, remembered, onChange, onEnter, onActive, onFocusChange }: {
  text: string;
  renderText: (text: string) => ReactNode;
  values?: Record<string, string>;
  remembered?: string[];
  onChange?: (name: string, value: string) => void;
  onEnter?: (name: string) => void;
  onActive?: (name: string | null) => void;
  onFocusChange?: (focused: boolean) => void;
}) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return <>{parts.map((part, index) => {
    const match = /^\[([^\]]+)\]$/.exec(part);
    if (!match) return <span key={index}>{renderText(part)}</span>;
    const name = match[1].trim();
    if (!values || !onChange) return <mark key={index} className="snippet-variable">{renderText(name)}</mark>;
    const value = values[name] || "";
    return (
      <span key={index} className="var-chip" data-filled={value ? "" : undefined} data-remembered={remembered?.includes(name) ? "" : undefined} title={remembered?.includes(name) ? "上次填的，点一下可以改" : undefined}>
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

export function SnippetFill({ item, state, onState, renderText, onSubmit, onActive, onFocusChange }: {
  item: SecretItem;
  state: SnippetFillState;
  onState: (update: (current: SnippetFillState) => SnippetFillState) => void;
  renderText: (text: string) => ReactNode;
  onSubmit: () => void;
  onActive: (name: string | null) => void;
  onFocusChange: (focused: boolean) => void;
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
        />
      </p>
      {meta.requiredInputs.length > 0 && <fieldset className="copy-checks"><legend>发送前确认</legend>{meta.requiredInputs.map((input) => <label key={input}><input type="checkbox" checked={state.checkedInputs.includes(input)} onChange={(event) => onState((current) => ({ ...current, checkedInputs: event.target.checked ? [...current.checkedInputs, input] : current.checkedInputs.filter((value) => value !== input) }))} /><span>已确认 {input}</span></label>)}</fieldset>}
      {meta.requiresVerification && <label className="copy-warning"><input type="checkbox" checked={state.verificationConfirmed} onChange={(event) => onState((current) => ({ ...current, verificationConfirmed: event.target.checked }))} /><span><strong>发送前核实</strong> 金额、库存、地址或时效已按当前情况检查</span></label>}
    </div>
  );
}
