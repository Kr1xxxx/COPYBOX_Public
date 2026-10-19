import { useState, type ReactNode } from "react";
import { splitParagraphs, splitSearchHighlight } from "./clipbox-core";
import { SnippetVariableText } from "./fill-panel";

// Small presentational pieces shared across the main page (moved out of page.tsx unchanged).

const ICON_PATHS: Record<string, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  mini: <><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><rect x="4" y="13" width="8" height="7" rx="1.5" /></>,
  pin: <><path d="M9 4h6l-1 5.5 3 2.5v2H7v-2l3-2.5L9 4z" /><path d="M12 14v6" /></>,
  restore: <><path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" /><path d="M15 4h5v5M20 4l-7 7" /></>,
  grid: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 10h16" /></>,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  more: <><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  note: <><path d="M7 3.5h7.5L19 8v12.5H7z" /><path d="M14 3.5V8h5M10 12.5h6M10 16h4" /></>,
  shield: <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3z" />,
  place: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  chevronUp: <path d="M6 14l6-6 6 6" />,
  chevronDown: <path d="M6 10l6 6 6-6" />,
  chevronLeft: <path d="M14 6l-6 6 6 6" />,
  chevronRight: <path d="M10 6l6 6-6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  grip: <path d="M9.5 6.5h.01M14.5 6.5h.01M9.5 12h.01M14.5 12h.01M9.5 17.5h.01M14.5 17.5h.01" strokeWidth="2.6" />,
};

export function Icon({ name, filled = false, className }: { name: keyof typeof ICON_PATHS; filled?: boolean; className?: string }) {
  return (
    <svg className={`icon${className ? ` ${className}` : ""}`} width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  );
}

export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  return <>{splitSearchHighlight(text, query).map((piece, index) => piece.hit
    ? <mark key={index} className="search-hit">{piece.text}</mark>
    : <span key={index}>{piece.text}</span>)}</>;
}

// A variable shows as a highlighted block without its brackets (the same block the open card types into).
// A 话术 with blank lines between its parts shows each part with its own small copy button, so it can go out as several
// short messages. A copied part keeps its tick until the card closes. One part only: the text shows as before.
export function ParagraphCopy({ text, lang, render, onCopy }: { text: string; lang: string; render: (part: string) => ReactNode; onCopy: (part: string) => Promise<boolean> }) {
  const [copied, setCopied] = useState<string[]>([]);
  const parts = splitParagraphs(text);
  if (parts.length < 2) return <p className="row-content" lang={lang}>{render(text)}</p>;
  return (
    <div className="row-content row-paragraphs" lang={lang}>
      {parts.map((part, index) => {
        const done = copied.includes(part);
        return (
          <div key={index} className="row-paragraph" data-copied={done ? "" : undefined}>
            <span className="row-paragraph-text">{render(part)}</span>
            <button type="button" className="paragraph-copy" aria-label={done ? `第 ${index + 1} 段已复制` : `复制第 ${index + 1} 段`} title={done ? "这段已复制" : "复制这段"} onClick={() => void onCopy(part).then((ok) => { if (ok) setCopied((list) => list.includes(part) ? list : [...list, part]); })}><Icon name={done ? "check" : "copy"} /></button>
          </div>
        );
      })}
    </div>
  );
}

export function SnippetContent({ text, query = "" }: { text: string; query?: string }) {
  return <SnippetVariableText text={text} renderText={(part) => <Highlight text={part} query={query} />} />;
}

export function SnippetTitle({ label, query = "" }: { label: string; query?: string }) {
  const separatorIndex = label.search(/[|｜]/);
  if (separatorIndex < 0) return <Highlight text={label} query={query} />;

  const primary = label.slice(0, separatorIndex).trim();
  const detail = label.slice(separatorIndex + 1).trim();
  if (!primary || !detail) return <Highlight text={label} query={query} />;

  return <><span className="snippet-title-primary"><Highlight text={primary} query={query} /></span><span className="snippet-title-separator">｜</span><span className="snippet-title-detail"><Highlight text={detail} query={query} /></span></>;
}

export function VaultMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`vault-mark ${small ? "small" : ""}`} aria-hidden="true">
      <span className="vault-lid" />
      <span className="vault-body">C</span>
    </span>
  );
}
