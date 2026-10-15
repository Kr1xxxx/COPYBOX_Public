"use client";

// 设置 → 数据 → 始终允许的程序: the programs marked 「始终允许」 when the command line asked for a 秘密 (D-059), each with 取消.
import { useEffect, useState } from "react";
import { AUTOMATION_TRUST_EVENT, readTrustedCallers, withoutTrustedCaller, writeTrustedCallers, type TrustedCaller } from "./automation-trust";
import { formatTaipeiDate } from "./clipbox-core";

export function useTrustedCallers() {
  const [list, setList] = useState<TrustedCaller[]>(() => (typeof window === "undefined" ? [] : readTrustedCallers()));
  useEffect(() => {
    const refresh = () => setList(readTrustedCallers());
    window.addEventListener(AUTOMATION_TRUST_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(AUTOMATION_TRUST_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  return list;
}

/** Whether the 始终允许的程序 card belongs on this computer: the command line door runs on macOS and Linux. */
export function automationCardShown(isDesktop: boolean, listLength: number) {
  const platform = typeof window === "undefined" ? "" : window.clipboxDesktop?.platform ?? "";
  return listLength > 0 || (isDesktop && platform !== "" && platform !== "win32");
}

export function AutomationTrustRows({ list }: { list: TrustedCaller[] }) {
  if (!list.length) {
    return <div className="settings-row static"><div><strong>还没有</strong><small>命令行读取秘密时，在询问框里点「始终允许」，那个程序以后就不用再问。</small></div></div>;
  }
  return (
    <ul className="automation-trust-list" aria-label="始终允许的程序">
      {list.map((entry) => (
        <li key={entry.id} className="settings-row">
          <div><strong>{entry.name}</strong><small>{entry.id}</small><small>{formatTaipeiDate(entry.addedAt)}起始终允许读取秘密</small></div>
          <button type="button" className="secondary-button" aria-label={`取消始终允许 ${entry.name}`} onClick={() => writeTrustedCallers(withoutTrustedCaller(readTrustedCallers(), entry.id))}>取消</button>
        </li>
      ))}
    </ul>
  );
}
