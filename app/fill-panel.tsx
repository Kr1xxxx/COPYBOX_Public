"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { SecretItem } from "./clipbox-core";
import { fillSnippetTemplate, snippetCopyReadiness } from "./snippet-import";

export type CopyLanguage = "en" | "zh";
export type SnippetCopyRequest = { item: SecretItem; language: CopyLanguage };

export function SnippetFillPanel({ request, onClose, onCopy }: {
  request: SnippetCopyRequest;
  onClose: () => void;
  onCopy: (text: string) => Promise<void>;
}) {
  const meta = request.item.snippetMeta!;
  const [language, setLanguage] = useState<CopyLanguage>(request.language);
  const [values, setValues] = useState<Record<string, string>>({});
  const [checkedInputs, setCheckedInputs] = useState<string[]>([]);
  const [verificationConfirmed, setVerificationConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);
  const source = language === "zh" ? meta.chineseText : request.item.secret;
  const filled = fillSnippetTemplate(source, values);
  const readiness = snippetCopyReadiness(request.item, values, checkedInputs, verificationConfirmed);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!readiness.ready || !source) return;
    setBusy(true);
    try {
      await onCopy(filled.text);
    } finally {
      setBusy(false);
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- delegated Esc for the form inside
    <section className="fill-panel" role="group" aria-label={`填写变量 ${request.item.label}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); onClose(); }
      }}>
      <form ref={formRef} onSubmit={submit}>
        {meta.chineseText && <div className="copy-language" role="group" aria-label="复制语言"><button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>英文</button><button type="button" className={language === "zh" ? "active" : ""} onClick={() => setLanguage("zh")}>中文</button></div>}
        {meta.placeholders.length > 0 && <fieldset className="copy-fields"><legend>填写正文变量</legend>{meta.placeholders.map((placeholder, index) => <label key={placeholder}><span>{placeholder}</span><input ref={index === 0 ? firstRef : undefined} value={values[placeholder] || ""} onChange={(event) => setValues((current) => ({ ...current, [placeholder]: event.target.value }))} placeholder={`输入 ${placeholder}`} /></label>)}</fieldset>}
        {meta.requiredInputs.length > 0 && <fieldset className="copy-checks"><legend>发送前确认</legend>{meta.requiredInputs.map((input) => <label key={input}><input type="checkbox" checked={checkedInputs.includes(input)} onChange={(event) => setCheckedInputs((current) => event.target.checked ? [...current, input] : current.filter((value) => value !== input))} /><span>已确认 {input}</span></label>)}</fieldset>}
        {meta.requiresVerification && <label className="copy-warning"><input type="checkbox" checked={verificationConfirmed} onChange={(event) => setVerificationConfirmed(event.target.checked)} /><span><strong>发送前核实</strong> 金额、库存、地址或时效已按当前情况检查</span></label>}
        <section className="copy-preview"><h3>{language === "en" ? "英文预览" : "中文预览"}</h3><p lang={language === "en" ? "en" : "zh"}>{filled.text}</p></section>
        <div className="fill-actions"><button type="button" className="ghost-button" onClick={onClose} disabled={busy}>取消</button><button type="submit" className="primary-button" disabled={busy || !readiness.ready || !source}>{busy ? "正在复制…" : `复制${language === "en" ? "英文" : "中文"}`}</button></div>
      </form>
    </section>
  );
}
