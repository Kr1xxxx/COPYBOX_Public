"use client";

// 设置 → AI → 「连接 Codex 等工具」 (D-060): copyable commands that let AI tools reach Copyboxx through `--mcp`.
import { useEffect, useState } from "react";
import { EXAMPLE_PROGRAM_PATH, claudeAddCommand, codexAddCommand, codexConfigBlock } from "./mcp-connect";

export function McpConnectRows() {
  const desktop = typeof window === "undefined" ? undefined : window.clipboxDesktop;
  const platform = desktop?.platform === "darwin" ? "darwin" : "win32";
  const [path, setPath] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    let cancelled = false;
    desktop?.mcpProgramPath?.().then((value) => { if (!cancelled && value) setPath(value); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [desktop]);
  const program = path ?? EXAMPLE_PROGRAM_PATH[platform];
  const example = path === null;
  const copy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => { setCopied(id); window.setTimeout(() => setCopied((value) => (value === id ? "" : value)), 1600); }).catch(() => undefined);
  };
  const entry = (id: string, title: string, hint: string, text: string) => (
    <div className="settings-row mcp-connect-row" key={id}>
      <div><strong>{title}</strong><small>{hint}</small><pre className="mcp-connect-code" aria-label={`${title}命令`}>{text}</pre></div>
      <button type="button" className="secondary-button" onClick={() => copy(id, text)}>{copied === id ? "已复制" : "复制"}</button>
    </div>
  );
  return (
    <>
      <div className="settings-row static"><div><strong>本机接口</strong><small>Codex、Claude Code、Cursor 等 AI 工具可以通过它查看、新增和整理话术。要读取秘密时，Copyboxx 会先弹窗问你。</small></div></div>
      {entry("codex", "Codex", "在终端里运行一次", codexAddCommand(program, platform))}
      {entry("claude", "Claude Code", "在终端里运行一次", claudeAddCommand(program, platform))}
      {entry("toml", "Codex 配置文件", "也可以把这几行加到 .codex 文件夹里的 config.toml", codexConfigBlock(program))}
      <p className="settings-note">{example ? "示例路径：在桌面版里打开这里，会显示这台电脑上的真实路径。" : "使用时 Copyboxx 要保持打开。"}其他工具填写同样的程序路径，参数写 --mcp。</p>
    </>
  );
}
