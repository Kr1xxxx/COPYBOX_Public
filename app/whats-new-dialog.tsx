"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RELEASE_NOTES } from "./release-notes";
import { markNoticeSeen, parseContentNotice, takeAppNotice, takeContentNotice, type WhatsNewNotice } from "./whats-new";

// The web preview and the browser tests can show a sample: dispatch `clipbox:whats-new` with {title?, items, kind?}.
export const WHATS_NEW_PREVIEW_EVENT = "clipbox:whats-new";

type Queued = { notice: WhatsNewNotice; preview?: boolean };

// Holds the notices waiting to be shown (D-070): the app's own after an update, then any that came with a 同步码 sync.
// `ready`: the data is open, the full window shows and no first-run guide is up; until then they wait.
export function useWhatsNew({ ready, version, firstRun, previewTools }: { ready: boolean; version: string; firstRun: boolean; previewTools: boolean }) {
  const [queue, setQueue] = useState<Queued[]>([]);
  const [appDone, setAppDone] = useState(false);
  // Same answer however often it runs: with a notice nothing is stored until 知道了, without one the version is stored.
  const appNotice = useMemo(() => (version ? takeAppNotice(RELEASE_NOTES, version, firstRun) : null), [version, firstRun]);

  useEffect(() => {
    if (!previewTools) return;
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent).detail as { kind?: string } | undefined;
      const parsed = parseContentNotice({ id: "preview", ...detail });
      if (!parsed) return;
      const notice: WhatsNewNotice = detail?.kind === "app" ? { ...parsed, kind: "app", id: version || "1.0.0", title: "Copyboxx 已更新" } : parsed;
      setQueue((current) => [...current, { notice, preview: true }]);
    };
    window.addEventListener(WHATS_NEW_PREVIEW_EVENT, onPreview);
    return () => window.removeEventListener(WHATS_NEW_PREVIEW_EVENT, onPreview);
  }, [previewTools, version]);

  const offerContent = useCallback((incoming: WhatsNewNotice | null, hadEntries: boolean) => {
    const notice = takeContentNotice(incoming, hadEntries);
    if (!notice) return;
    setQueue((current) => current.some((item) => item.notice.kind === "content" && item.notice.id === notice.id) ? current : [...current, { notice }]);
  }, []);

  const head = useMemo<Queued | undefined>(() => (appNotice && !appDone ? { notice: appNotice } : queue[0]), [appNotice, appDone, queue]);
  const dismiss = useCallback(() => {
    if (!head) return;
    if (!head.preview) markNoticeSeen(head.notice);
    if (head.notice === appNotice) setAppDone(true);
    else setQueue((current) => current.slice(1));
  }, [head, appNotice]);

  return { notice: ready && head ? head.notice : null, offerContent, dismiss };
}

const ACCENTS = ["orange", "blue", "green"] as const;

// One short card: what is new, in a few lines, and 知道了. Styled with the brand dialog tokens in globals.css.
export function WhatsNewDialog({ notice, onClose }: { notice: WhatsNewNotice; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { buttonRef.current?.focus(); }, [notice]);
  useEffect(() => {
    const node = dialogRef.current;
    const onKey = (event: KeyboardEvent) => {
      // 知道了 is the only button, so Tab stays on it; Escape closes like 知道了.
      if (event.key === "Tab") {
        event.preventDefault();
        buttonRef.current?.focus();
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
    <div className="whats-new-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="whats-new-dialog" data-kind={notice.kind} role="dialog" aria-modal="true" aria-labelledby="whats-new-title" aria-describedby="whats-new-list" data-local-esc>
        <header className="whats-new-head">
          <span className="whats-new-mark" aria-hidden="true"><i /><i /><i /></span>
          <h2 id="whats-new-title">{notice.title}</h2>
          <p>{notice.kind === "app" ? `现在是 ${notice.id} 版` : "不用更新软件，已经自动同步好了"}</p>
        </header>
        <ul id="whats-new-list" className="whats-new-list">
          {notice.items.map((text, index) => <li key={index} data-accent={ACCENTS[index % ACCENTS.length]}>{text}</li>)}
        </ul>
        <div className="whats-new-actions"><button ref={buttonRef} type="button" className="primary" onClick={onClose}>知道了</button></div>
      </section>
    </div>
  );
}
