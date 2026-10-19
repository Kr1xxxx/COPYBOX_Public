"use client";

import { useEffect, useState } from "react";
import { CHECKUP_SEEN_KEY, SHORT_PASSWORD, checkupDue, hasProblems, passwordHealth, type PasswordHealth } from "./account-health";
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
  const clean = !hasProblems(health);
  return (
    <>
      <p className="pay-meta">只在本机检查，密码不会发到网上。点一条去修改。</p>
      {clean && <p className="totp-empty">没有发现问题。</p>}
      {group("重复使用的密码", health.reused.flat())}
      {group("密码强度低", health.weak)}
      {group(`少于 ${SHORT_PASSWORD} 位`, health.short)}
      {group("一年以上没改", health.old)}
    </>
  );
}

function readSeenAt(): number | null {
  try { const value = Number(localStorage.getItem(CHECKUP_SEEN_KEY)); return value > 0 ? value : null; } catch { return null; }
}

// The red dot on 密码体检: when it has not been opened for two months (or never), the check runs by itself on this device
// each time the 账号 entries change, and the dot shows while it finds anything. Opening the check clears it for two months.
export function useCheckupDot(deviceKey: string, trigger: unknown): { dot: boolean; markSeen: () => void } {
  const [found, setFound] = useState(false);
  const [seenAt, setSeenAt] = useState(readSeenAt);
  const [openedAt] = useState(Date.now);
  const due = deviceKey !== "" && checkupDue(seenAt, openedAt);
  useEffect(() => {
    if (!due) return;
    let live = true;
    openSecretItemsStore(deviceKey).list()
      .then((items) => { if (live) setFound(hasProblems(passwordHealth(items, Date.now()))); })
      .catch(() => { if (live) setFound(false); });
    return () => { live = false; };
  }, [deviceKey, due, trigger]);
  const markSeen = () => {
    const now = Date.now();
    try { localStorage.setItem(CHECKUP_SEEN_KEY, String(now)); } catch { /* the dot then just comes back next time */ }
    setSeenAt(now);
  };
  return { dot: due && found, markSeen };
}
