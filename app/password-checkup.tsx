"use client";

import { useEffect, useState } from "react";
import { SHORT_PASSWORD, passwordHealth, type PasswordHealth } from "./account-health";
import type { LoginItem } from "./payment-core";
import { openSecretItemsStore } from "./secret-items-store";
import { SiteBadge } from "./site-badge";
import { detectSite } from "./site-core";
import { Icon } from "./ui-atoms";

// 密码体检: logins whose password is used more than once, too short, or not changed for a year. Worked out on this device only.
export function PasswordCheckup({ deviceKey, onOpen }: { deviceKey: string; onOpen: (id: string) => void }) {
  const [health, setHealth] = useState<PasswordHealth | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    openSecretItemsStore(deviceKey).list()
      .then((items) => { if (live) setHealth(passwordHealth(items, Date.now())); })
      .catch((reason: Error) => { if (live) setError(reason.message); });
    return () => { live = false; };
  }, [deviceKey]);

  if (error) return <p className="settings-note" role="alert">{error}</p>;
  if (!health) return <p className="settings-note">正在检查…</p>;
  const row = (item: LoginItem, key: string) => (
    <li key={key} className="pay-item">
      <button type="button" className="pay-head" onClick={() => onOpen(item.id)}>
        <SiteBadge site={detectSite({ url: item.url, name: item.name })} />
        <span className="totp-who"><strong>{item.name}</strong><small>{item.username}</small></span>
        <Icon name="chevron" className="pay-chevron" />
      </button>
    </li>
  );
  const group = (title: string, items: LoginItem[]) => items.length > 0 && (
    <section className="checkup-group" aria-label={title}>
      <h3>{title} · {items.length}</h3>
      <ul className="totp-list pay-list">{items.map((item) => row(item, item.id))}</ul>
    </section>
  );
  const clean = health.reused.length + health.short.length + health.old.length === 0;
  return (
    <>
      <p className="pay-meta">只在本机检查，密码不会发到网上。点一条去修改。</p>
      {clean && <p className="totp-empty">没有发现问题。</p>}
      {group("重复使用的密码", health.reused.flat())}
      {group(`少于 ${SHORT_PASSWORD} 位`, health.short)}
      {group("一年以上没改", health.old)}
    </>
  );
}
