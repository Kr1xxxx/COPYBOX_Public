"use client";

import type { ReactNode } from "react";
import { type Block, type Inline, parseMarkdown } from "./note-core";

// Draws a note's Markdown from the parsed data only: text is always text (React escapes it), and links are web
// addresses that open outside the app. No HTML from the note ever reaches the page.
function inline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.t === "text") return node.text;
    if (node.t === "br") return <br key={index} />;
    if (node.t === "code") return <code key={index}>{node.text}</code>;
    if (node.t === "link") return <a key={index} href={node.href} target="_blank" rel="noreferrer noopener">{inline(node.children)}</a>;
    const Tag = node.t === "strong" ? "strong" : node.t === "em" ? "em" : "del";
    return <Tag key={index}>{inline(node.children)}</Tag>;
  });
}

function block(item: Block, index: number): ReactNode {
  switch (item.t) {
    case "heading": { const Tag = `h${Math.min(item.level + 2, 6)}` as "h3" | "h4" | "h5" | "h6"; return <Tag key={index}>{inline(item.content)}</Tag>; }
    case "paragraph": return <p key={index}>{inline(item.content)}</p>;
    case "code": return <pre key={index}><code>{item.text}</code></pre>;
    case "quote": return <blockquote key={index}>{inline(item.content)}</blockquote>;
    case "hr": return <hr key={index} />;
    case "list": {
      const items = item.items.map((entry, at) => (
        <li key={at} className={entry.checked === undefined ? undefined : "note-task"}>
          {entry.checked !== undefined && <input type="checkbox" checked={entry.checked} readOnly disabled aria-label={entry.checked ? "已完成" : "未完成"} />}
          {inline(entry.content)}
        </li>
      ));
      return item.ordered ? <ol key={index} start={item.start}>{items}</ol> : <ul key={index}>{items}</ul>;
    }
  }
}

export function NoteMarkdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return <div className="note-md">{blocks.length ? blocks.map(block) : <p className="note-empty">（空白）</p>}</div>;
}
