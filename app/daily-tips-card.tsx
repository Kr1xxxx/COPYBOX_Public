"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mergeServerTips, pickTipForDay, readTipsState, TIPS_URL, todayKey, writeTipsState, type Tip } from "./daily-tips";
import { fetchSharedLibraryText } from "./shared-library-client";

// The 每日小贴士 card above 回收站 in the sidebar, and the dialog that shows the whole tip.
// Reads the stored state, picks today's tip and, when the day moved on, saves the new choice.
function pickAndSave(): Tip {
  const before = readTipsState();
  const picked = pickTipForDay(before, todayKey());
  if (picked.state !== before) writeTipsState(picked.state);
  return picked.tip;
}

export function DailyTipsCard() {
  // The page renders only in the browser (it reads storage while rendering too), so the first pick can happen here.
  const [tip, setTip] = useState<Tip>(() => pickTipForDay(readTipsState(), todayKey()).tip);
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);
  const refresh = useCallback(() => setTip(pickAndSave()), []);

  // Saves the first pick, and picks again when the window comes back, so an app left open overnight moves on.
  useEffect(() => {
    pickAndSave();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
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
    cardRef.current?.focus();
  }, []);

  return (
    <div className="daily-tips-slot">
      <button ref={cardRef} type="button" className="daily-tips" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="daily-tips-label">每日小贴士</span>
        <span className="daily-tips-title">{tip.title}</span>
      </button>
      {open && createPortal(<DailyTipDialog tip={tip} onClose={close} />, document.body)}
    </div>
  );
}

function DailyTipDialog({ tip, onClose }: { tip: Tip; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);
  useEffect(() => {
    const node = dialogRef.current;
    const onKey = (event: KeyboardEvent) => {
      // The only control is 知道了, so focus stays on it instead of leaving the dialog.
      if (event.key === "Tab") { event.preventDefault(); node?.querySelector<HTMLButtonElement>("button")?.focus(); return; }
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
          <div><p>每日小贴士</p><h2 id="daily-tips-title">{tip.title}</h2></div>
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
