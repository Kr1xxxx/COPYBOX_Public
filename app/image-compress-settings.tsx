"use client";

import { useState } from "react";
import { COMPRESS_MONTHLY_LIMIT, customKeyStatus, readCompressUsage, readCustomKeys, saveCustomKeys } from "./image-compress";

const SLOT = ["第一个", "第二个"];

// What the 压缩服务密钥 row says about the keys in use.
function keyStatusText(keys: [string, string], now: Date): string {
  const { active, refused } = customKeyStatus(localStorage, now);
  if (active === null) return "正在使用内置密钥";
  const count = keys.filter(Boolean).length;
  if (refused.includes(active)) return "你填写的密钥本月都不能用了，下个月 1 号恢复";
  const using = count === 2 ? `正在使用${SLOT[active]}密钥` : "正在使用你填写的密钥";
  const other = 1 - active;
  if (count === 2 && refused.includes(other)) return `${SLOT[other]}密钥本月不能用了（额度用完或密钥不对），${using}`;
  return count === 2 ? `${using}，用完后自动换${SLOT[other]}` : using;
}

// 设置 → 数据: how many pictures were compressed this month, and the keys the compression uses.
export function ImageCompressSettings() {
  const [now] = useState(() => new Date());
  const [used] = useState(() => readCompressUsage(localStorage, now));
  const [keys, setKeys] = useState<[string, string]>(() => readCustomKeys(localStorage));
  const [draft, setDraft] = useState<[string, string]>(["", ""]);
  const [editing, setEditing] = useState(false);

  function save() {
    saveCustomKeys(localStorage, draft, now);
    setKeys(readCustomKeys(localStorage));
    setEditing(false);
    setDraft(["", ""]);
  }

  return (
    <>
      <div className="settings-row static"><div><strong>本月已压缩</strong><small>{used} / {COMPRESS_MONTHLY_LIMIT} 张。新添加的图片会先压缩再加密保存，用完后下个月 1 号恢复</small></div></div>
      {/* Most people never need their own key: it sits under 高级, open once a key of their own is saved (owner, 2026-10-14). */}
      <details className="settings-advanced" open={keys.some(Boolean) || undefined}>
        <summary>高级</summary>
        {editing ? (
          <div className="settings-row compress-keys-edit"><div className="compress-keys-fields">
            <label className="settings-ai-field"><span>第一个密钥</span>
              <input value={draft[0]} onChange={(event) => setDraft([event.target.value, draft[1]])} placeholder="留空则用内置密钥" spellCheck={false} autoComplete="off" /></label>
            <label className="settings-ai-field"><span>第二个密钥（选填）</span>
              <input value={draft[1]} onChange={(event) => setDraft([draft[0], event.target.value])} placeholder="第一个用完后自动换这个" spellCheck={false} autoComplete="off" /></label>
          </div>
            <button type="button" className="secondary-button" onClick={save}>保存</button></div>
        ) : (
          <div className="settings-row"><div><strong>压缩服务密钥</strong><small>{keyStatusText(keys, now)}</small></div>
            <button type="button" className="secondary-button" onClick={() => { setDraft(keys); setEditing(true); }}>更换…</button></div>
        )}
      </details>
    </>
  );
}
