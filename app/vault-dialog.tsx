"use client";

import { useEffect, useRef, useState } from "react";
import { ArcSegmented } from "./arc/segmented";
import { ApiKeyPanel } from "./apikey-panel";
import { LoginPanel } from "./login-panel";
import { PaymentPanel } from "./payment-panel";
import { SiteIconsProvider } from "./site-icons-context";
import { TotpPanel } from "./totp-dialog";
import { VaultOverview, type VaultTab } from "./vault-overview";

// The hidden 保险箱 (Mac only). 全部 groups everything by website or type; the other tabs add and edit one type each.
// One tab each for 账号密码, 收款信息, API 密钥 and 验证码.
export function VaultDialog({ deviceKey, onClose, onHide, onToast }: { deviceKey: string; onClose: () => void; onHide: () => void; onToast: (message: string) => void }) {
  const [tab, setTab] = useState<VaultTab>("all");
  // Opening an entry from 全部 switches to its tab with that entry expanded; the key makes the panel start fresh.
  const [focus, setFocus] = useState<{ id: string; n: number }>({ id: "", n: 0 });
  const [confirmHide, setConfirmHide] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if ((event.target as HTMLElement | null)?.closest?.("form")) return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  function select(next: VaultTab) {
    setTab(next);
    setFocus((current) => ({ id: "", n: current.n + 1 }));
  }

  return (
    <SiteIconsProvider deviceKey={deviceKey}>
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-dialog totp-dialog vault-dialog" role="dialog" aria-modal="true" aria-labelledby="vault-title">
        <header><h2 id="vault-title">保险箱</h2><button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="关闭保险箱">×</button></header>
        <div className="settings-body">
          <ArcSegmented className="settings-segment vault-tabs" label="保险箱内容" value={tab} onSelect={(next) => select(next as VaultTab)}
            options={[{ value: "all", label: "全部" }, { value: "login", label: "账号密码" }, { value: "payment", label: "收款信息" }, { value: "apikey", label: "API 密钥" }, { value: "totp", label: "验证码" }]} />
          <div key={`${tab}:${focus.n}`} className="vault-panel">
            {tab === "all" && <VaultOverview deviceKey={deviceKey} onOpen={(next, id) => { setTab(next); setFocus((current) => ({ id, n: current.n + 1 })); }} />}
            {tab === "login" && <LoginPanel deviceKey={deviceKey} onToast={onToast} focusId={focus.id} />}
            {tab === "payment" && <PaymentPanel deviceKey={deviceKey} onToast={onToast} focusId={focus.id} />}
            {tab === "apikey" && <ApiKeyPanel deviceKey={deviceKey} onToast={onToast} focusId={focus.id} />}
            {tab === "totp" && <TotpPanel deviceKey={deviceKey} onToast={onToast} />}
          </div>
          <div className="totp-actions vault-foot">
            <p className="settings-note">用本机密钥加密保存；导出「秘密备份」时会一起加密带上。隐藏入口后，在设置里连点版本号 5 次可重新打开。</p>
            {confirmHide
              ? <span className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => setConfirmHide(false)}>取消</button><button type="button" className="secondary-button" onClick={onHide}>确认隐藏</button></span>
              : <button type="button" className="secondary-button" onClick={() => setConfirmHide(true)} title="隐藏后入口消失；内容仍保存在本机">隐藏入口</button>}
          </div>
        </div>
      </section>
    </div>
    </SiteIconsProvider>
  );
}
