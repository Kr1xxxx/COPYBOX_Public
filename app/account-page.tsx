"use client";

import { useState, type ReactNode } from "react";
import { AccountList, type AccountView } from "./account-list";
import type { AccountEntry, EntryKind } from "./account-view";
import { ApiKeyPanel } from "./apikey-panel";
import { ListScrollFrame } from "./list-scroll-rail";
import { LoginPanel } from "./login-panel";
import type { MarkItem } from "./payment-core";
import { PaymentPanel } from "./payment-panel";
import { RecoveryPanel } from "./recovery-panel";
import { SiteIconsProvider } from "./site-icons-context";
import { TotpPanel } from "./totp-dialog";

export type AddRequest = { tab: EntryKind; n: number };
type Panel = { tab: EntryKind; focusId: string; adding: boolean; n: number };

// The 账号 page (Mac): the list of everything, or one entry's panel (to open, change or add). The category and the search
// text come from the page (sidebar and toolbar); `legacyView` is the old 秘密 list that the 「其他」 category shows.
export function AccountPage({ deviceKey, entries, trashed, marks, error, category, view, query, addRequest, onOpenLegacy, onPinLegacy, onTrashLegacy, onToast, legacyView, selecting, folded, onSelectingChange }: {
  deviceKey: string; entries: AccountEntry[] | null; trashed: AccountEntry[]; marks: Record<string, MarkItem>; error: string; category: EntryKind | "all"; view: AccountView; query: string;
  addRequest: AddRequest | null; onOpenLegacy: (id: string) => void; onPinLegacy: (id: string) => void; onTrashLegacy: (ids: string[]) => Promise<void>; onToast: (message: string) => void; legacyView: ReactNode;
  selecting: boolean; folded: boolean; onSelectingChange: (selecting: boolean) => void;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  // Changing category or asking for 新增 from outside changes what is shown (set while rendering, no effect needed).
  const [seenCategory, setSeenCategory] = useState(`${view}:${category}`);
  const [seenAdd, setSeenAdd] = useState(addRequest?.n ?? 0);
  if (seenCategory !== `${view}:${category}`) { setSeenCategory(`${view}:${category}`); setPanel(null); }
  if ((addRequest?.n ?? 0) !== seenAdd) {
    setSeenAdd(addRequest?.n ?? 0);
    if (addRequest) setPanel({ tab: addRequest.tab, focusId: "", adding: true, n: addRequest.n });
  }

  const back = () => setPanel(null);
  function open(entry: AccountEntry) {
    if (entry.legacy) onOpenLegacy(entry.id);
    else setPanel({ tab: entry.tab, focusId: entry.id, adding: false, n: Date.now() });
  }

  let body: ReactNode;
  if (category === "other" && view === "all") body = legacyView;
  else if (panel) {
    const common = { deviceKey, onToast, focusId: panel.focusId, startAdding: panel.adding };
    body = (
      <div key={`${panel.tab}:${panel.n}`} className="vault-panel">
        <div><button type="button" className="secondary-button" onClick={back}>‹ 返回列表</button></div>
        {panel.tab === "login" && <LoginPanel {...common} />}
        {panel.tab === "payment" && <PaymentPanel {...common} />}
        {panel.tab === "apikey" && <ApiKeyPanel {...common} />}
        {panel.tab === "recovery" && <RecoveryPanel {...common} />}
        {panel.tab === "totp" && <TotpPanel deviceKey={deviceKey} onToast={onToast} startAdding={panel.adding} />}
      </div>
    );
  } else if (error) body = <p className="settings-note" role="alert">{error}</p>;
  else if (entries === null) body = <p className="settings-note">正在读取…</p>;
  else {
    const list = <div className="vault-panel"><AccountList deviceKey={deviceKey} entries={entries} trashed={trashed} marks={marks} category={category} view={view} query={query} selecting={selecting} folded={folded} onSelectingChange={onSelectingChange} onOpen={open} onPinLegacy={onPinLegacy} onTrashLegacy={onTrashLegacy} onToast={onToast} /></div>;
    // The 回收站 also holds the old entries that were deleted, shown by the old list under the new ones.
    body = view === "trash" ? <>{list}{legacyView}</> : list;
  }

  return (
    <SiteIconsProvider deviceKey={deviceKey}>
      <ListScrollFrame className="vault-frame"><section className="vault-inline" aria-label="保险箱">{body}</section></ListScrollFrame>
    </SiteIconsProvider>
  );
}
