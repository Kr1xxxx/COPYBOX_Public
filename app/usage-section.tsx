"use client";

import { useMemo } from "react";
import type { SecretItem } from "./clipbox-core";
import { rankUsage, USAGE_STALE_DAYS } from "./usage-ranking";

const LONG_LIST = 30;
// A fresh install has every 话术 here; 5 are enough to show what the block means.
const NEVER_LIST = 5;

function daysAgo(at: number | undefined, now: number) {
  if (typeof at !== "number") return "";
  const days = Math.floor((now - at) / 86_400_000);
  return days <= 0 ? "今天用过" : `${days} 天前用过`;
}

// 使用排行 (话术 only): who is copied most, who has been idle for 30 days, who was never used.
export function UsageSection({ items, now, onShow }: { items: SecretItem[]; now: number; onShow: (item: SecretItem) => void }) {
  const ranking = useMemo(() => rankUsage(items, now), [items, now]);
  const blocks: { id: string; title: string; hint: string; rows: SecretItem[]; limit: number; note: (item: SecretItem) => string }[] = [
    { id: "top", title: "最常用", hint: "复制次数最多的 10 条；同一条一分钟内连续复制只算 1 次", rows: ranking.top, limit: LONG_LIST, note: (item) => `${item.useCount || 0} 次` },
    { id: "stale", title: `${USAGE_STALE_DAYS} 天没用过`, hint: "以前用过，最近一个月没有再用", rows: ranking.stale, limit: LONG_LIST, note: (item) => daysAgo(item.lastUsedAt, now) },
    { id: "never", title: "从来没用过", hint: "还没有复制过的话术", rows: ranking.never, limit: NEVER_LIST, note: () => "" },
  ];
  return (
    <>
      <p className="settings-note">只记每条话术被复制了几次和最近一次的时间，不记高亮块里填的内容。</p>
      {blocks.map((block) => (
        <div key={block.id} className="usage-block" data-usage={block.id}>
          <h4>{block.title}<small className="usage-count">{block.rows.length} 条</small></h4>
          <p className="settings-note">{block.hint}</p>
          {block.rows.length === 0
            ? <p className="usage-empty">暂时没有</p>
            : <ul className="usage-list">
              {block.rows.slice(0, block.limit).map((item) => (
                <li key={item.id}>
                  <button type="button" className="usage-row" onClick={() => onShow(item)} title="在话术列表里找到这条">
                    <span className="usage-label">{item.label || "（没有标题）"}</span>
                    <span className="usage-note">{block.note(item)}</span>
                  </button>
                </li>
              ))}
              {block.rows.length > block.limit && <li className="usage-more">还有 {block.rows.length - block.limit} 条没有列出</li>}
            </ul>}
        </div>
      ))}
    </>
  );
}
