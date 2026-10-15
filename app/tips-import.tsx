"use client";

import { useRef, useState } from "react";
import { importTips, readTipsState, writeTipsState } from "./daily-tips";
import { readTipsFile } from "./tips-doc";

// 设置 → 数据 → 导入 Tips (D-068): a .md Tips document or an .xlsx / .csv table goes straight into the Tips card.
export const TIPS_CHANGED_EVENT = "clipbox-tips-changed";

export function TipsImportRow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ text: string; error?: true } | null>(null);
  async function importFile(file: File) {
    try {
      const tips = await readTipsFile(file);
      const done = importTips(readTipsState(), tips);
      writeTipsState(done.state);
      window.dispatchEvent(new Event(TIPS_CHANGED_EVENT));
      const parts = [done.added && `新增 ${done.added} 条`, done.updated && `更新 ${done.updated} 条`, done.unchanged && `${done.unchanged} 条没有变化`].filter(Boolean);
      setResult({ text: `已导入 Tips：${parts.join("，") || "没有可导入的内容"}` });
    } catch (error) {
      setResult({ text: error instanceof Error ? error.message : "无法读取这个 Tips 文件", error: true });
    }
  }
  return (
    <div className="settings-row">
      <div><strong>导入 Tips</strong><small>读取 Tips 文档（.md）或表格（.xlsx / .csv），只在本机解析</small>
        {result && <small role="status" className={result.error ? "settings-error" : undefined}>{result.text}</small>}</div>
      <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>选择文件…</button>
      <input ref={inputRef} className="hidden-input" type="file" aria-label="选择 Tips 文件" accept=".md,.xlsx,.csv,text/markdown,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} />
    </div>
  );
}
