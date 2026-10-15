"use client";

// The short guide shown once, the first time the full window opens (owner's request, 2026-10-13):
// four pages about 话术, 图片, 账号 and the mini window / data. 设置 → 关于 → 再看一遍 opens it again.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { resolveFocusWrapIndex } from "./clipbox-core";
import { Icon } from "./ui-atoms";

export const FIRST_RUN_GUIDE_KEY = "clipbox.first-run-guide.v1";

// Without storage the guide cannot be remembered; then it is better not to show it on every start.
function guideSeen() {
  try { return localStorage.getItem(FIRST_RUN_GUIDE_KEY) === "1"; } catch { return true; }
}

function markGuideSeen() {
  try { localStorage.setItem(FIRST_RUN_GUIDE_KEY, "1"); } catch { /* shown again next time; nothing else depends on it */ }
}

// `ready`: the data is open and the full window is showing. Unseen at start → open once it is ready, until closed.
export function useFirstRunGuide(ready: boolean) {
  const [unseen] = useState(() => typeof window !== "undefined" && !guideSeen());
  const [closed, setClosed] = useState(false);
  const [again, setAgain] = useState(false);
  const close = useCallback(() => { setClosed(true); setAgain(false); markGuideSeen(); }, []);
  const show = useCallback(() => setAgain(true), []);
  // firstRun: the guide was never closed on this device, i.e. a new install (no 更新通知 for it, D-071).
  return { open: again || (unseen && !closed && ready), show, close, firstRun: unseen };
}

type GuidePage = { title: string; lines: string[]; art: ReactNode };

// Only the desktop app has the 固定在最上层 button (next to the mini button).
function pinLine() {
  if (typeof window === "undefined" || !window.clipboxDesktop?.setPinned) return "";
  return "点右上角迷你按钮左边的图钉，窗口就固定在最前面，再点一下取消。";
}

function trayLine() {
  const platform = typeof window === "undefined" ? undefined : window.clipboxDesktop?.platform;
  if (platform === "win32") return "点窗口的关闭按钮不会退出，它会收在右下角的托盘里，点托盘图标就能再打开。";
  if (platform === "darwin") return "关掉窗口后它还在屏幕顶部的菜单栏里，点那里的图标就能再打开。";
  return "";
}

function SnippetArt() {
  return (
    <div className="guide-art-snippet">
      <div className="guide-mock-search"><Icon name="search" /><span>tk</span><i className="guide-caret" /></div>
      <div className="guide-mock-row hit"><Icon name="star" filled /><span className="guide-bar w70" /><span className="guide-mock-copy"><Icon name="copy" /></span></div>
      <div className="guide-mock-row"><Icon name="star" /><span className="guide-bar w55" /><span className="guide-mock-copy"><Icon name="copy" /></span></div>
      <div className="guide-mock-chips"><span>售后</span><span>物流</span><span>活动</span></div>
    </div>
  );
}

function ImageArt() {
  return (
    <div className="guide-art-image">
      <div className="guide-mock-grid">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={`guide-tile t${index}`}>
            <svg viewBox="0 0 40 30" aria-hidden="true" focusable="false"><circle cx="29" cy="9" r="4" /><path d="M0 30 13 15l9 9 6-5 12 11z" /></svg>
            {index === 1 && <b className="guide-tile-done"><Icon name="check" />已复制</b>}
          </span>
        ))}
      </div>
      <div className="guide-mock-drop"><Icon name="plus" /><span>拖进来</span></div>
    </div>
  );
}

function AccountArt() {
  return (
    <div className="guide-art-account">
      <div className="guide-mock-card">
        <div className="guide-mock-site"><span className="guide-site-dot">店</span><span className="guide-bar w45" /></div>
        <div className="guide-mock-field"><span className="guide-bar w30" /><span className="guide-mask">••••••••</span></div>
        <div className="guide-mock-field"><span>验证码</span><span className="guide-code">284 913</span></div>
      </div>
      <span className="guide-lock"><Icon name="lock" /></span>
    </div>
  );
}

function MiniArt({ platform }: { platform: string | undefined }) {
  return (
    <div className={`guide-art-mini ${platform === "darwin" ? "mac" : ""}`}>
      <div className="guide-mock-screen">
        {platform === "darwin" && <div className="guide-menubar"><i className="guide-tray-icon" /></div>}
        <div className="guide-mock-chat"><span className="guide-bar w60" /><span className="guide-bar w40 me" /><span className="guide-bar w50" /></div>
        <div className="guide-mock-mini"><Icon name="mini" /><span className="guide-bar w70" /><span className="guide-bar w55" /><span className="guide-bar w65" /></div>
        {platform !== "darwin" && <div className="guide-taskbar"><i className="guide-tray-icon" /></div>}
      </div>
      <span className="guide-shield"><Icon name="pin" /></span>
    </div>
  );
}

function guidePages(platform: string | undefined): GuidePage[] {
  return [
    {
      title: "话术：常用回复，一键复制",
      lines: ["点右边的复制按钮，或双击一行，就复制好了。", "顶部能搜标题和内容，中文、英文单词、拼音、拼音首字母都行。", "点星标收藏常用的，左边用目录分好类。", "公司给了企业同步码的话，在「设置」首页填上，公司话术会自动同步进来。"],
      art: <SnippetArt />,
    },
    {
      title: "图片：常发的图存起来",
      lines: ["点右上角「新增图片」，或直接把图片拖进来。", "点一下图片就复制，到聊天里粘贴即可。"],
      art: <ImageArt />,
    },
    {
      title: "账号：密码和验证码放这里",
      lines: ["登录账号、收款信息、验证码等，加密后只存在这台电脑上。", "想更放心，可以在「设置 → 数据」里给账号页加一个密码。"],
      art: <AccountArt />,
    },
    {
      title: "迷你窗口和置顶",
      lines: ["点右上角的迷你按钮换成小窗口，边聊边复制。", pinLine(), trayLine()].filter(Boolean),
      art: <MiniArt platform={platform} />,
    },
  ];
}

// `fallbackFocus`: where focus goes when the button that opened the guide is gone (it was inside 设置).
export function FirstRunGuide({ onClose, fallbackFocus }: { onClose: () => void; fallbackFocus?: string }) {
  const [platform] = useState(() => (typeof window === "undefined" ? undefined : window.clipboxDesktop?.platform));
  const pages = guidePages(platform);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const dialogRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const last = step === pages.length - 1;
  const page = pages[step];

  // onClose may be a fresh closure on every render of the page; keep it in a ref so the listener stays put.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    nextRef.current?.focus();
    return () => {
      const target = opener && opener.isConnected && opener !== document.body ? opener : fallbackFocus ? document.querySelector<HTMLElement>(fallbackFocus) : null;
      target?.focus();
    };
  }, [fallbackFocus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") || []);
      const wrapIndex = resolveFocusWrapIndex(focusable.indexOf(document.activeElement as HTMLElement), focusable.length, event.shiftKey);
      if (wrapIndex >= 0) {
        event.preventDefault();
        focusable[wrapIndex].focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  function go(next: number) {
    if (next === step || next < 0 || next >= pages.length) return;
    setDirection(next > step ? "forward" : "back");
    setStep(next);
    // 上一步 is not shown on the first page: keep focus inside the dialog when it disappears.
    if (next === 0 && document.activeElement?.classList.contains("guide-back")) nextRef.current?.focus();
  }

  return (
    <div className="guide-backdrop" role="presentation">
      <section ref={dialogRef} className="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title" aria-describedby="guide-lines">
        <button type="button" className="guide-close" onClick={onClose} aria-label="关闭使用说明"><span aria-hidden="true">×</span></button>
        <div key={`art-${step}`} className="guide-art" data-direction={direction} aria-hidden="true">{page.art}</div>
        <div key={`text-${step}`} className="guide-text" data-direction={direction}>
          <p className="guide-count">{step + 1} / {pages.length}</p>
          <h2 id="guide-title">{page.title}</h2>
          <ul id="guide-lines">{page.lines.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
        <footer className="guide-actions">
          <button type="button" className="ghost-button guide-skip" onClick={onClose}>跳过</button>
          <div className="guide-dots" role="group" aria-label="第几步">
            {pages.map((item, index) => (
              <button key={item.title} type="button" className={index === step ? "active" : ""} aria-current={index === step ? "step" : undefined} aria-label={`第 ${index + 1} 步：${item.title}`} onClick={() => go(index)} />
            ))}
          </div>
          <div className="guide-nav">
            {step > 0 && <button type="button" className="secondary-button guide-back" onClick={() => go(step - 1)}>上一步</button>}
            <button ref={nextRef} type="button" className="primary-button guide-next" onClick={() => (last ? onClose() : go(step + 1))}>{last ? "开始使用" : "下一步"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
