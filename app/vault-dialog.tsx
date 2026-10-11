"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArcSegmented } from "./arc/segmented";
import { ApiKeyPanel } from "./apikey-panel";
import { LoginPanel } from "./login-panel";
import { PaymentPanel } from "./payment-panel";
import { SiteIconsProvider } from "./site-icons-context";
import { TotpPanel } from "./totp-dialog";
import { SAMPLES_DONE_KEY, restoreSampleEntries } from "./vault-samples";
import { RecoveryPanel } from "./recovery-panel";
import { VaultOverview, type LegacySecret, type VaultTab } from "./vault-overview";

// The hidden 保险箱 (Mac only). 全部 groups everything by website or type; the other tabs add and edit one type each.
// One tab each for 账号密码, 收款信息, API 密钥, 恢复码 and 验证码.
// `inline` = the 秘密 page itself (Mac): no frame, no close button.
export function VaultDialog({ deviceKey, legacySecrets, onOpenLegacy, onClose, onToast, inline = false, legacyView }: {
  deviceKey: string; legacySecrets: LegacySecret[]; onOpenLegacy: (id: string) => void; onClose: () => void; onToast: (message: string) => void; inline?: boolean; legacyView?: ReactNode;
}) {
  const [tab, setTab] = useState<VaultTab | "legacy">("all");
  // Opening an entry from 全部 switches to its tab with that entry expanded; the key makes the panel start fresh.
  const [focus, setFocus] = useState<{ id: string; n: number }>({ id: "", n: 0 });
  // Examples go in once, next to anything already there; the panels start after that check so they never miss them.
  const [ready, setReady] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => { if (!inline) closeRef.current?.focus(); }, [inline]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (localStorage.getItem(SAMPLES_DONE_KEY) === "1") return;
        // Added beside whatever is already there (old 秘密, earlier 验证码): only the missing 范例 go in, nothing is changed.
        await restoreSampleEntries(deviceKey);
        localStorage.setItem(SAMPLES_DONE_KEY, "1");
      } catch {
        // Examples are a nicety: if anything is unreadable nothing is written and the 保险箱 opens as it is.
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => { live = false; };
  }, [deviceKey]);
  useEffect(() => {
    if (inline) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if ((event.target as HTMLElement | null)?.closest?.("form")) return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [inline]);

  function select(next: VaultTab | "legacy") {
    setTab(next);
    setFocus((current) => ({ id: "", n: current.n + 1 }));
  }

  const content = (
    <div className="settings-body">
      <ArcSegmented className="settings-segment vault-tabs" label="保险箱内容" value={tab} onSelect={(next) => select(next as VaultTab | "legacy")}
        options={[{ value: "all", label: "全部" }, { value: "login", label: "账号密码" }, { value: "payment", label: "收款信息" }, { value: "apikey", label: "API 密钥" }, { value: "recovery", label: "恢复码" }, { value: "totp", label: "验证码" }, ...(legacyView ? [{ value: "legacy", label: "其他" }] : [])]} />
      {!ready ? <p className="settings-note">正在打开…</p> : <div key={`${tab}:${focus.n}`} className="vault-panel">
        {tab === "all" && <VaultOverview deviceKey={deviceKey} legacySecrets={legacySecrets} onOpenLegacy={(id) => { setTab("legacy"); setFocus((current) => ({ id: "", n: current.n + 1 })); onOpenLegacy(id); }} onOpen={(next, id) => { setTab(next); setFocus((current) => ({ id, n: current.n + 1 })); }} />}
        {tab === "login" && <LoginPanel deviceKey={deviceKey} onToast={onToast} focusId={focus.id} />}
        {tab === "payment" && <PaymentPanel deviceKey={deviceKey} onToast={onToast} focusId={focus.id} />}
        {tab === "apikey" && <ApiKeyPanel deviceKey={deviceKey} onToast={onToast} focusId={focus.id} />}
        {tab === "recovery" && <RecoveryPanel deviceKey={deviceKey} onToast={onToast} focusId={focus.id} />}
        {tab === "totp" && <TotpPanel deviceKey={deviceKey} onToast={onToast} />}
        {tab === "legacy" && legacyView}
      </div>}
      <div className="totp-actions vault-foot">
        <p className="settings-note">用本机密钥加密保存；导出「账号备份」时会一起加密带上。</p>
      </div>
    </div>
  );
  if (inline) return <SiteIconsProvider deviceKey={deviceKey}><section className="vault-inline" aria-label="保险箱">{content}</section></SiteIconsProvider>;
  return (
    <SiteIconsProvider deviceKey={deviceKey}>
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-dialog totp-dialog vault-dialog" role="dialog" aria-modal="true" aria-labelledby="vault-title">
        <header><h2 id="vault-title">保险箱</h2><button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="关闭保险箱">×</button></header>
        {content}
      </section>
    </div>
    </SiteIconsProvider>
  );
}
