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
};

export function emptyFillState(item: SecretItem, language: CopyLanguage = "en"): SnippetFillState {
  return { itemId: item.id, language, values: {}, checkedInputs: [], verificationConfirmed: false };
}

// A variable shows as a highlighted block without its brackets. Static in the collapsed list, a field in the open card.
export function SnippetVariableText({ text, renderText, values, onChange, onEnter, onFocusChange }: {
  text: string;
  renderText: (text: string) => ReactNode;
  values?: Record<string, string>;
  onChange?: (name: string, value: string) => void;
  onEnter?: (name: string) => void;
  onFocusChange?: (focused: boolean) => void;
}) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return <>{parts.map((part, index) => {
    const match = /^\[([^\]]+)\]$/.exec(part);
    if (!match) return <span key={index}>{renderText(part)}</span>;
    const name = match[1].trim();
    if (!values || !onChange) return <mark key={index} className="snippet-variable">{name}</mark>;
    const value = values[name] || "";
    return (
      <span key={index} className="var-chip" data-filled={value ? "" : undefined}>
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
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); onEnter?.(name); }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); }
          }}
        />
      </span>
    );
  })}</>;
}

export function SnippetFill({ item, state, onState, renderText, onSubmit, onFocusChange }: {
  item: SecretItem;
  state: SnippetFillState;
  onState: (update: (current: SnippetFillState) => SnippetFillState) => void;
  renderText: (text: string) => ReactNode;
  onSubmit: () => void;
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
          onChange={(name, value) => onState((current) => ({ ...current, values: { ...current.values, [name]: value } }))}
          onEnter={next}
          onFocusChange={onFocusChange}
        />
      </p>
      {meta.requiredInputs.length > 0 && <fieldset className="copy-checks"><legend>发送前确认</legend>{meta.requiredInputs.map((input) => <label key={input}><input type="checkbox" checked={state.checkedInputs.includes(input)} onChange={(event) => onState((current) => ({ ...current, checkedInputs: event.target.checked ? [...current.checkedInputs, input] : current.checkedInputs.filter((value) => value !== input) }))} /><span>已确认 {input}</span></label>)}</fieldset>}
      {meta.requiresVerification && <label className="copy-warning"><input type="checkbox" checked={state.verificationConfirmed} onChange={(event) => onState((current) => ({ ...current, verificationConfirmed: event.target.checked }))} /><span><strong>发送前核实</strong> 金额、库存、地址或时效已按当前情况检查</span></label>}
    </div>
  );
}
