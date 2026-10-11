"use client";

import { useState } from "react";
import { COMPRESS_MONTHLY_LIMIT, TINIFY_KEY_STORAGE, readCompressUsage } from "./image-compress";

// 设置 → 数据: how many pictures were compressed this month, and the key the compression uses.
export function ImageCompressSettings() {
  const [used] = useState(() => readCompressUsage(localStorage, new Date()));
  const [custom, setCustom] = useState(() => { try { return localStorage.getItem(TINIFY_KEY_STORAGE) || ""; } catch { return ""; } });
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  function save(value: string) {
    try { if (value) localStorage.setItem(TINIFY_KEY_STORAGE, value); else localStorage.removeItem(TINIFY_KEY_STORAGE); } catch { /* optional */ }
    setCustom(value);
    setEditing(false);
    setDraft("");
  }

  return (
    <>
      <div className="settings-row static"><div><strong>本月已压缩</strong><small>{used} / {COMPRESS_MONTHLY_LIMIT} 张。新添加的图片会先压缩再加密保存，用完后下个月 1 号恢复</small></div></div>
      {editing ? (
        <div className="settings-row"><label className="settings-ai-field" style={{ flex: 1 }}><span>压缩服务密钥</span>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="留空则用内置密钥" spellCheck={false} autoComplete="off" /></label>
          <button type="button" className="secondary-button" onClick={() => save(draft.trim())}>保存</button></div>
      ) : (
        <div className="settings-row"><div><strong>压缩服务密钥</strong><small>{custom ? "正在使用你填写的密钥" : "正在使用内置密钥"}</small></div>
          <button type="button" className="secondary-button" onClick={() => { setDraft(custom); setEditing(true); }}>更换…</button></div>
      )}
    </>
  );
}
