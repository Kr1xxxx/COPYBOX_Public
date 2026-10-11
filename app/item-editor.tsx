"use client";

import { ArcSegmented } from "./arc/segmented";
import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { aiRewrite } from "./ai-client";
import { formatSecretReference } from "./clipbox-automation";
import {
  attemptEditorSave,
  combineSecretSegments,
  limitChars,
  normalizeReferenceNote,
  resolveAiRewrite,
  resolveSelectedFolder,
  SNIPPET_NOTE_MAX,
  splitSecretSegments,
  type AiRewriteMode,
  type ItemKind,
  type SecretItem,
} from "./clipbox-core";
import { copyTextWithExpiry } from "./clipboard";
import { PLAIN_NOTES, SECRET_WORD } from "./platform";
import { extractPlaceholders, productGroupsForRawProduct } from "./snippet-import";
import { markVariable, unmarkVariable, type VariableEdit } from "./snippet-variables";
import { STANDARD_SNIPPET_FOLDERS } from "./snippet-folders";

const COLORS = ["#ffb02e", "#4bc67a", "#4f8df7", "#9b70df", "#ef6d63", "#23b6b0"];

export function ItemEditor({ kind, item, folders, defaultFolder, onClose, onDelete, onSave, onCopy }: { kind: ItemKind; item: SecretItem | null; folders: string[]; defaultFolder: string; onClose: () => void; onDelete?: () => Promise<void>; onSave: (data: Omit<SecretItem, "id" | "createdAt" | "updatedAt">) => Promise<void>; onCopy: (text: string) => Promise<void> }) {
  const structured = Boolean(item?.snippetMeta);
  const [label, setLabel] = useState(item?.label || "");
  const [secret, setSecret] = useState(item?.secret || "");
  const [secretParts, setSecretParts] = useState<[string, string]>(() => item?.secretSegments || splitSecretSegments(item?.secret || ""));
  const [segmentedSecret, setSegmentedSecret] = useState(kind === "secret" && !PLAIN_NOTES && Boolean(item?.secretSegments));
  const [summary, setSummary] = useState(item?.summary || "");
  const [chineseText, setChineseText] = useState(item?.snippetMeta?.chineseText || "");
  const [rawProduct, setRawProduct] = useState(item?.snippetMeta?.rawProduct || "");
  const [usageNote, setUsageNote] = useState(item?.snippetMeta?.usageNote || "");
  const [referenceNote, setReferenceNote] = useState(kind === "secret" ? item?.note || "" : "");
  const [aiNotice, setAiNotice] = useState("");
  const [aiUndo, setAiUndo] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [referenceStatus, setReferenceStatus] = useState<"idle" | "copied" | "error">("idle");
  const [folder, setFolder] = useState(resolveSelectedFolder(folders, item?.folder || defaultFolder || (kind === "snippet" ? STANDARD_SNIPPET_FOLDERS[0] : ""), kind === "secret"));
  const [color] = useState(item?.color || (kind === "snippet" ? "#ffcfa8" : COLORS[0]));
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState<AiRewriteMode | null>(null);
  const [visible, setVisible] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const copyOnSubmitRef = useRef(false);
  const latestContentRef = useRef(secret);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const chineseRef = useRef<HTMLTextAreaElement>(null);
  // The 话术内容 and 中文翻译 boxes are about three lines tall when there is little text, grow while typing, and scroll past a limit.
  useLayoutEffect(() => {
    if (kind !== "snippet") return;
    for (const area of [contentRef.current, chineseRef.current]) {
      if (!area) continue;
      const line = parseFloat(getComputedStyle(area).lineHeight) || 20;
      area.style.height = "0px";
      area.style.height = `${Math.min(Math.max(area.scrollHeight, line * 3), line * 9)}px`;
    }
  }, [kind, secret, chineseText]);
  const [variableNotice, setVariableNotice] = useState("");
  const [variableNames, setVariableNames] = useState<string[]>(() => extractPlaceholders(item?.secret || ""));

  useEffect(() => {
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, []);

  useEffect(() => {
    dialogRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [busy, onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !label.trim() || !secret) return;
    setBusy(true);
    setSaveError("");
    const shouldCopy = copyOnSubmitRef.current;
    copyOnSubmitRef.current = false;
    const selectedFolder = resolveSelectedFolder(folders, folder, kind === "secret");
    const nextSummary = kind === "snippet" ? (structured ? summary.trim() : limitChars(summary, SNIPPET_NOTE_MAX)) : "";
    const snippetMeta = structured && item?.snippetMeta ? {
      ...item.snippetMeta,
      stage: selectedFolder,
      scene: label.trim(),
      action: nextSummary,
      productGroups: productGroupsForRawProduct(rawProduct),
      rawProduct: rawProduct.trim(),
      chineseText,
      placeholders: extractPlaceholders(`${secret}\n${chineseText}`),
      usageNote: usageNote.trim(),
    } : kind === "snippet" && (extractPlaceholders(`${secret}\n${chineseText}`).length > 0 || chineseText.trim()) ? {
      // A 话术 typed by hand gets its variable blocks here; nothing else about it changes.
      stage: selectedFolder,
      scene: label.trim(),
      action: nextSummary,
      productGroups: [],
      rawProduct: "",
      chineseText,
      placeholders: extractPlaceholders(`${secret}\n${chineseText}`),
      requiredInputs: [],
      usageNote: "",
      requiresVerification: false,
    } : undefined;
    const result = await attemptEditorSave(() => onSave({
      label: label.trim(),
      secret,
      secretSegments: kind === "secret" && segmentedSecret ? secretParts : undefined,
      note: kind === "secret" ? normalizeReferenceNote(referenceNote) : item?.note || "",
      color,
      kind,
      folder: selectedFolder,
      summary: nextSummary,
      snippetMeta,
    }));
    if (!result.saved) {
      setSaveError(result.error);
      setBusy(false);
      return;
    }
    if (shouldCopy && !structured) {
      await onCopy(secret);
      window.clipboxDesktop?.didCopy();
    }
  }

  function toggleSecretSegments() {
    if (kind !== "secret") return;
    if (segmentedSecret) {
      setSecret(combineSecretSegments(secretParts));
      setSegmentedSecret(false);
      return;
    }
    const nextParts = splitSecretSegments(secret);
    setSecretParts(nextParts);
    setSecret(combineSecretSegments(nextParts));
    setSegmentedSecret(true);
  }

  function updateSecretPart(index: 0 | 1, value: string) {
    const nextParts: [string, string] = index === 0 ? [value, secretParts[1]] : [secretParts[0], value];
    setSecretParts(nextParts);
    setSecret(combineSecretSegments(nextParts));
  }

  async function copyEditorReference() {
    if (kind !== "secret" || !item) return;
    try {
      await copyTextWithExpiry(formatSecretReference(item.id));
      setReferenceStatus("copied");
      window.clipboxDesktop?.didCopy();
      window.setTimeout(() => setReferenceStatus("idle"), 1600);
    } catch {
      setReferenceStatus("error");
    }
  }

  // Set the selected words as a highlighted variable block, or take the brackets off the block under the cursor.
  function editVariable(change: (text: string, start: number, end: number) => VariableEdit) {
    const area = contentRef.current;
    if (!area) return;
    const result = change(area.value, area.selectionStart, area.selectionEnd);
    if (!result.ok) { setVariableNotice(result.error); return; }
    latestContentRef.current = result.text;
    setSecret(result.text);
    setVariableNames(extractPlaceholders(result.text));
    setVariableNotice("");
    setAiNotice("");
    setAiUndo(null);
    window.requestAnimationFrame(() => { area.focus(); area.setSelectionRange(result.start, result.end); });
  }

  async function rewrite(mode: AiRewriteMode) {
    const captured = latestContentRef.current;
    if (!captured.trim() || aiBusy) return;
    setAiBusy(mode);
    setAiNotice("");
    try {
      const generated = await aiRewrite(mode, captured);
      if (generated.error) { setAiNotice(generated.error); return; }
      if (generated.unavailable) {
        setAiNotice("还没有可用的 AI：请在 设置 → AI 里填写自己的接口，才能润色；「AI 整理」仍可使用");
        return;
      }
      const result = resolveAiRewrite(captured, latestContentRef.current, generated.text);
      if (result.stale) return;
      if (result.error) { setAiNotice(result.error); return; }
      setAiUndo(captured);
      latestContentRef.current = result.text;
      setSecret(result.text);
      setAiNotice(mode === "polish" ? "已润色" : "已整理");
    } finally {
      setAiBusy(null);
    }
  }

  function undoRewrite() {
    if (aiUndo === null) return;
    latestContentRef.current = aiUndo;
    setSecret(aiUndo);
    setAiUndo(null);
    setAiNotice("");
  }

  return (
    <section ref={dialogRef} className="inline-editor" role="group" aria-label={item ? `编辑 ${item.label}` : kind === "secret" ? `添加${SECRET_WORD}` : "添加话术"}>
      <header className="inline-editor-head">
        <div className={`editor-kind ${kind}`}>
          <span>{item ? "编辑" : "新增"}{kind === "secret" ? SECRET_WORD : "话术"}</span>
          {kind === "snippet" && item?.snippetNumber && <b className="editor-snippet-number">{item.snippetNumber}</b>}
          {kind === "secret" && !PLAIN_NOTES && item && <button type="button" className={`editor-reference ${referenceStatus}`} onClick={() => void copyEditorReference()} disabled={busy} aria-live="polite">{referenceStatus === "copied" ? "已复制" : referenceStatus === "error" ? "复制失败" : "复制引用"}</button>}
        </div>
        <span className="inline-editor-hint">{kind === "secret" ? (PLAIN_NOTES ? "加密保存在这台电脑上" : "加密保存在这台设备上") : structured ? "中英文和使用规则一起加密保存" : "小提示只给自己看；内容可用 AI 润色或整理"}</span>
      </header>
      <form ref={formRef} onSubmit={submit}>
          <div className="editor-body">
            <div className="editor-meta-grid">
              <label className="native-field"><span>{structured ? "具体场景" : "标题"}</span><div className="soft-input"><input ref={titleInputRef} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === "secret" ? (PLAIN_NOTES ? "例如 常用地址" : "例如 prod-ssh") : "例如 售后夸赞"} maxLength={60} /></div></label>
              <label className="native-field folder-field">
                <span>目录 <small>{kind === "secret" ? "可选择或手写" : "必选"}</small></span>
                <div className="folder-select">
                  {kind === "secret" ? <>
                    <input
                      list="secret-folder-options"
                      value={folder}
                      onChange={(event) => setFolder(event.target.value)}
                      placeholder="未分类"
                      maxLength={30}
                      autoComplete="off"
                    />
                    <datalist id="secret-folder-options">
                      {folders.map((value) => <option key={value} value={value} />)}
                    </datalist>
                  </> : <select value={folder} onChange={(event) => setFolder(event.target.value)} required>
                    {folders.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>}
                </div>
              </label>
            </div>

            {kind === "secret" && !PLAIN_NOTES && <label className="native-field reference-note-field"><span>被什么引用 <small>可选</small></span><div className="soft-input"><input value={referenceNote} onChange={(event) => setReferenceNote(event.target.value)} placeholder="例如 Shopify API、订单同步任务" maxLength={120} /></div></label>}

            {kind === "secret" && !PLAIN_NOTES && <ArcSegmented className="segmented" label="内容显示方式" value={visible ? "show" : "hide"} onSelect={(value) => setVisible(value === "show")}
              options={[{ value: "hide", label: "隐藏内容" }, { value: "show", label: "明文显示" }]} />}

            <div className={`native-field content-field ${kind === "snippet" ? "snippet-content" : ""}`}><span className="content-field-head"><span>{kind === "secret" ? (PLAIN_NOTES ? "备注内容" : "密码 / 文本") : "话术内容"}</span>{kind === "secret" && !PLAIN_NOTES && <button type="button" className={segmentedSecret ? "segment-toggle active" : "segment-toggle"} aria-pressed={segmentedSecret} onClick={toggleSecretSegments}>{segmentedSecret ? "合并" : "分段"}</button>}{kind === "snippet" && <span className="variable-actions"><button type="button" className="segment-toggle" onMouseDown={(event) => event.preventDefault()} onClick={() => editVariable(markVariable)} title="先选中一段文字，再点这里：复制时它会变成可以填写的高亮块">设为高亮</button><button type="button" className="segment-toggle" onMouseDown={(event) => event.preventDefault()} onClick={() => editVariable(unmarkVariable)} title="光标放在高亮块里，再点这里">取消高亮</button></span>}{kind === "snippet" && <span className="ai-actions">{aiUndo !== null && <button type="button" className="segment-toggle ai-undo" onClick={undoRewrite} disabled={Boolean(aiBusy)}>撤销</button>}<button type="button" className="segment-toggle" onClick={() => void rewrite("polish")} disabled={Boolean(aiBusy) || !secret.trim()}>{aiBusy === "polish" ? "润色中…" : "AI 润色"}</button><button type="button" className="segment-toggle" onClick={() => void rewrite("organize")} disabled={Boolean(aiBusy) || !secret.trim()}>{aiBusy === "organize" ? "整理中…" : "AI 整理"}</button></span>}</span><div className={`soft-textarea ${segmentedSecret ? "secret-segmented" : ""}`}>{segmentedSecret ? <><textarea aria-label={`${SECRET_WORD}第一段`} className={!visible ? "masked" : ""} value={secretParts[0]} onChange={(event) => updateSecretPart(0, event.target.value)} placeholder="第一段" rows={2} /><textarea aria-label={`${SECRET_WORD}第二段`} className={!visible ? "masked" : ""} value={secretParts[1]} onChange={(event) => updateSecretPart(1, event.target.value)} placeholder="第二段" rows={2} /></> : <textarea ref={contentRef} aria-label={kind === "secret" ? (PLAIN_NOTES ? "备注内容" : "密码 / 文本") : "话术内容"} className={kind === "secret" && !PLAIN_NOTES && !visible ? "masked" : ""} value={secret} onChange={(event) => { latestContentRef.current = event.target.value; setSecret(event.target.value); setAiNotice(""); setAiUndo(null); setVariableNotice(""); if (kind === "snippet") setVariableNames(extractPlaceholders(event.target.value)); }} placeholder={kind === "secret" ? (PLAIN_NOTES ? "输入要保存的备注内容" : "输入要保存的密码或文本") : "输入需要反复使用的话术"} rows={6} />}</div></div>

            {kind === "snippet" && <small className="variable-hint" role="status">{variableNotice || (variableNames.length > 0 ? `高亮块：${variableNames.join("、")}。复制时可以在这些位置填写。` : "想让某个词复制时能自己填？选中它，点「设为高亮」。")}</small>}
            {kind === "snippet" && <label className="native-field chinese-field"><span>中文翻译 <small>可选，自己写，不会被自动改</small></span><div className="soft-textarea compact"><textarea ref={chineseRef} value={chineseText} onChange={(event) => setChineseText(event.target.value)} rows={3} placeholder="复制时点「中文」就会复制这里的内容" lang="zh" /></div></label>}
            {kind === "snippet" && aiNotice && <small className="ai-notice" role="status">{aiNotice}</small>}

            {kind === "snippet" && <div className="native-field summary-field">
              <label htmlFor="summary-input">{structured ? "核心动作" : "小提示"} {!structured && <small>可选，最多 {SNIPPET_NOTE_MAX} 字</small>}</label>
              <div className="summary-control">
                <input id="summary-input" value={summary} onChange={(event) => setSummary(structured ? event.target.value : limitChars(event.target.value, SNIPPET_NOTE_MAX))} placeholder={structured ? "例如 发送睫毛报价" : "例如 售后夸赞时用"} />
              </div>
            </div>}
            {structured && <details className="structured-details">
              <summary>使用规则</summary>
              <div className="structured-fields">
                <label className="native-field"><span>产品 / 业务</span><div className="soft-input"><input value={rawProduct} onChange={(event) => setRawProduct(event.target.value)} /></div></label>
                <label className="native-field"><span>使用备注</span><div className="soft-textarea compact note"><textarea value={usageNote} onChange={(event) => setUsageNote(event.target.value)} rows={3} /></div></label>
              </div>
            </details>}
          </div>
          {saveError && <p className="editor-save-error" role="alert">{saveError}</p>}
          <footer className={`editor-footer ${onDelete ? "has-delete" : ""}`}>
            <div>{onDelete && <button type="button" className="delete-entry" onClick={() => void onDelete()}>移到回收站</button>}</div>
            <div className="editor-actions"><button type="button" className="editor-cancel" onClick={onClose} disabled={busy}>取消</button><button className={`editor-save ${structured ? "" : "secondary"}`} disabled={busy || !label.trim() || !secret}>{busy ? "正在保存…" : "保存"}</button>{!structured && <button className="editor-save" onClick={() => { copyOnSubmitRef.current = true; }} disabled={busy || !label.trim() || !secret}>{busy ? "正在保存…" : "保存并复制"}</button>}</div>
          </footer>
      </form>
    </section>
  );
}
