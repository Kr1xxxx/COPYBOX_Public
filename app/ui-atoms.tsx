import { splitSearchHighlight } from "./clipbox-core";

// Small presentational pieces shared across the main page (moved out of page.tsx unchanged).

const ICON_PATHS: Record<string, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  mini: <><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><rect x="4" y="13" width="8" height="7" rx="1.5" /></>,
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
  shield: <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3z" />,
  chevron: <path d="m6 9 6 6 6-6" />,
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

export function SnippetContent({ text, query = "" }: { text: string; query?: string }) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return <>{parts.map((part, index) => /^\[[^\]]+\]$/.test(part)
    ? <mark key={index} className="snippet-variable"><Highlight text={part} query={query} /></mark>
    : <span key={index}><Highlight text={part} query={query} /></span>)}</>;
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
