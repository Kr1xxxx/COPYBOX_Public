"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mergeServerTips, pickTipForDay, readTipsState, stepTip, tipPreview, tipsLibrary, TIPS_URL, todayKey, writeTipsState, type Tip } from "./daily-tips";
import { fetchSharedLibraryText } from "./shared-library-client";
import { Icon } from "./ui-atoms";
import { TIPS_CHANGED_EVENT } from "./tips-import";

// The Tips card above 回收站 in the sidebar (today's tip, 上一条 / 下一条 to browse), and the dialog that shows the whole tip.
// Reads the stored state, picks today's tip and, when the day moved on, saves the new choice.
function pickAndSave(): Tip {
  const before = readTipsState();
  const picked = pickTipForDay(before, todayKey());
  if (picked.state !== before) writeTipsState(picked.state);
  return picked.tip;
}

export function DailyTipsCard() {
  // The page renders only in the browser (it reads storage while rendering too), so the first pick can happen here.
  const [today, setToday] = useState<Tip>(() => pickTipForDay(readTipsState(), todayKey()).tip);
  // The tip being looked at with 上一条 / 下一条, tied to today's tip: when the day moves on, the card starts again from
  // the new tip. Browsing is not saved, so tomorrow still moves on from today's tip.
  const [browsed, setBrowsed] = useState<{ fromId: string; id: string } | null>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const refresh = useCallback(() => setToday(pickAndSave()), []);
  const library = tipsLibrary(readTipsState());
  const tip = (browsed?.fromId === today.id && library.find((entry) => entry.id === browsed.id)) || today;
  const step = (by: number) => setBrowsed({ fromId: today.id, id: stepTip(library, tip.id, by).id });

  // Saves the first pick, and picks again when the window comes back, so an app left open overnight moves on.
  useEffect(() => {
    pickAndSave();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener(TIPS_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(TIPS_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Company tips: read the file at most once a day. Off while TIPS_URL is empty; any trouble is ignored.
  useEffect(() => {
    if (!TIPS_URL) return;
    const today = todayKey();
    if (readTipsState().fetchedDate === today) return;
    let cancelled = false;
    void fetchSharedLibraryText(TIPS_URL).then((text) => {
      if (cancelled) return;
      writeTipsState(mergeServerTips(readTipsState(), text, today));
      refresh();
    }).catch(() => { /* the built-in and stored tips keep working */ });
    return () => { cancelled = true; };
  }, [refresh]);

  const close = useCallback(() => {
    setOpen(false);
    openRef.current?.focus();
  }, []);

  return (
    <div className="daily-tips-slot">
      <div className="daily-tips">
        <div className="daily-tips-head">
          <span className="daily-tips-label">Tips</span>
          <TipsNav onStep={step} />
        </div>
        <button ref={openRef} type="button" className="daily-tips-open" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          <span className="daily-tips-title">{tip.title}</span>
          <span className="daily-tips-preview">{tipPreview(tip)}</span>
        </button>
      </div>
      {open && createPortal(<DailyTipDialog tip={tip} onStep={step} onClose={close} />, document.body)}
    </div>
  );
}

// 上一条 / 下一条: the same two small arrows on the card and in the dialog. Both move the same browsed tip.
function TipsNav({ onStep }: { onStep: (by: number) => void }) {
  return (
    <span className="daily-tips-nav">
      <button type="button" aria-label="上一条" title="上一条" onClick={() => onStep(-1)}><Icon name="chevronLeft" /></button>
      <button type="button" aria-label="下一条" title="下一条" onClick={() => onStep(1)}><Icon name="chevronRight" /></button>
    </span>
  );
}

function DailyTipDialog({ tip, onStep, onClose }: { tip: Tip; onStep: (by: number) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);
  useEffect(() => {
    const node = dialogRef.current;
    const onKey = (event: KeyboardEvent) => {
      // Tab moves between 上一条, 下一条 and 知道了 and never leaves the dialog.
      if (event.key === "Tab") {
        event.preventDefault();
        const buttons = [...(node?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = at < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    node?.addEventListener("keydown", onKey);
    return () => node?.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="backup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="backup-dialog tips-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-tips-title" aria-describedby="daily-tips-text" tabIndex={-1} data-local-esc>
        <header className="backup-head">
          <div><p>Tips</p><h2 id="daily-tips-title">{tip.title}</h2></div>
          <TipsNav onStep={onStep} />
        </header>
        <div className="backup-form">
          <div id="daily-tips-text" className="tips-body">
            {tip.text && <p className="tips-text">{tip.text}</p>}
            {tip.examples?.length ? (
              <ul className="tips-examples">
                {tip.examples.map((example, index) => example.good
                  ? <li key={index} className="tips-good">{example.text}</li>
                  : <li key={index} className="tips-bad"><span className="sr-only">不要这样写：</span><s>{example.text}</s></li>)}
              </ul>
            ) : null}
            {tip.source && <p className="tips-source">来源: {tip.source}</p>}
          </div>
          <div className="backup-actions tips-actions"><button type="button" className="primary" onClick={onClose}>知道了</button></div>
        </div>
      </section>
    </div>
  );
}
