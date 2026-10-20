"use client";

// The login page (D-085): the app opens only after an email-code sign-in. Email → code → (an email outside the company
// domain) activation code. 人机验证 only when the server asks for it, i.e. after frequent code requests (D-087). Shown by page.tsx instead of the app while nobody is signed in on this computer.
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { maskEmail } from "./account-lock";
import { BrandWordmark } from "./brand-wordmark";
import { CloudError, looksLikeEmail, normalizeEmail } from "./cloud-client";
import { DEMO_ACTIVATION, DEMO_CODE } from "./cloud-demo";
import { errorText, type CloudSync } from "./cloud-sync-ui";
import type { ThemeChoice } from "./preferences";

// Cloudflare Turnstile (人机验证), shown once the server answered `captcha`. The site key is public; the server checks the token.
export const TURNSTILE_SITE_KEY = "0x4AAAAAAFbunVqZ_GEl5V7v";
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const RESEND_AFTER_S = 60;

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

// Loads the widget into `box` (not in the preview, which has no server behind it). `token` is "" until the person passes.
function useTurnstile(enabled: boolean, theme: ThemeChoice, box: RefObject<HTMLDivElement | null>) {
  const widget = useRef("");
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !box.current) return;
    let gone = false;
    const render = () => {
      if (gone || !box.current || !window.turnstile) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: theme === "system" ? "auto" : theme,
        language: "zh-cn",
        callback: (value: string) => setToken(value),
        "expired-callback": () => setToken(""),
        "error-callback": () => { setToken(""); setFailed(true); return true; },
      });
    };
    let script = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
    if (script && !window.turnstile && script.dataset.failed) { script.remove(); script = null; }
    if (!script) {
      script = document.createElement("script");
      script.src = TURNSTILE_SRC;
      script.async = true;
      script.addEventListener("error", () => { script!.dataset.failed = "1"; });
      document.head.appendChild(script);
    }
    if (window.turnstile) render();
    else {
      script.addEventListener("load", render);
      script.addEventListener("error", () => { if (!gone) setFailed(true); });
    }
    return () => {
      gone = true;
      if (widget.current) { try { window.turnstile?.remove(widget.current); } catch { /* already gone */ } widget.current = ""; }
    };
  }, [enabled, theme, attempt, box]);
  // A token is single-use: after a refused request the widget runs again.
  const reset = () => { setToken(""); if (widget.current) { try { window.turnstile?.reset(widget.current); } catch { /* re-rendered below */ } } };
  const retry = () => { setToken(""); setFailed(false); setAttempt((value) => value + 1); };
  return { token, failed, reset, retry };
}

type Step = "email" | "code" | "activate";

export function LoginGate({ cloud, theme }: { cloud: CloudSync; theme: ThemeChoice }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [activation, setActivation] = useState("");
  const [wait, setWait] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  // Set once the server refused a code request with `captcha`; from then on the widget stays for this login.
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const captchaBox = useRef<HTMLDivElement>(null);
  const captcha = useTurnstile(needCaptcha && step === "email", theme, captchaBox);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [step]);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function send() {
    if (!looksLikeEmail(email)) { setError("邮箱格式不对，请检查一下"); return; }
    if (needCaptcha && !captcha.token) { setError(captcha.failed ? "人机验证没有加载出来，请检查网络后重试" : "请先完成人机验证"); return; }
    setWorking(true); setError("");
    try {
      await cloud.sendCode(email, captcha.token);
      setStep("code");
      setCode("");
      setWait(RESEND_AFTER_S);
    } catch (failure) {
      setError(errorText(failure));
      captcha.reset();
      // Asked too often: the widget appears on the email step (also when resending from the code step).
      if (failure instanceof CloudError && failure.code === "captcha") { setNeedCaptcha(true); setStep("email"); }
    }
    setWorking(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    if (step === "email") { await send(); return; }
    if (step === "code" && !/^\d{6}$/.test(code.trim())) { setError("验证码是 6 位数字"); return; }
    if (step === "activate" && !activation.trim()) { setError("请填写激活码"); return; }
    setWorking(true); setError("");
    try {
      if (step === "code") {
        // Signed in → page.tsx shows the app; otherwise this email still needs an activation code.
        if (!await cloud.signIn(email, code)) setStep("activate");
      } else {
        await cloud.activate(activation);
      }
    } catch (failure) { setError(errorText(failure)); }
    setWorking(false);
  }

  function changeEmail() {
    setStep("email"); setCode(""); setActivation(""); setError(""); setWait(0);
  }

  const sent = maskEmail(normalizeEmail(email));
  return (
    <main className="login-gate">
      <form className="login-card" onSubmit={(event) => void submit(event)} noValidate aria-labelledby="login-title">
        <BrandWordmark className="login-wordmark" />
        {step === "email" && <>
          <h1 id="login-title">登录后开始使用</h1>
          <p>用邮箱收验证码登录，不用设密码。登录过的电脑，没有网络也能照常用。</p>
          <label htmlFor="login-email">邮箱</label>
          <input ref={inputRef} id="login-email" type="email" autoComplete="email" spellCheck={false} placeholder="填你的工作邮箱" value={email}
            onChange={(event) => { setEmail(event.target.value); setError(""); }} />
          {needCaptcha && <div className="login-captcha">
            <div ref={captchaBox} />
            {captcha.failed && <small>人机验证没有加载出来。<button type="button" className="login-link" onClick={captcha.retry}>重新加载</button></small>}
          </div>}
        </>}
        {step === "code" && <>
          <h1 id="login-title">填写验证码</h1>
          <p>验证码已发到 {sent}，10 分钟内有效。</p>
          <label htmlFor="login-code">验证码</label>
          <input ref={inputRef} id="login-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6 位数字" value={code}
            onChange={(event) => { setCode(event.target.value.replace(/\D/g, "")); setError(""); }} />
          <small className="login-resend">{wait > 0 ? `${wait} 秒后可重新发送` : <button type="button" className="login-link" disabled={working} onClick={() => void send()}>重新发送验证码</button>}</small>
        </>}
        {step === "activate" && <>
          <h1 id="login-title">填写激活码</h1>
          <p>{sent} 不是公司邮箱，需要激活码才能使用。还没有激活码？请联系管理员购买。</p>
          <label htmlFor="login-activation">激活码</label>
          <input ref={inputRef} id="login-activation" type="text" autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX-XXXX-XXXX" value={activation}
            onChange={(event) => { setActivation(event.target.value); setError(""); }} />
        </>}
        {cloud.demo && <small className="login-demo">测试版不会真的发邮件，验证码填 {DEMO_CODE}；不是 example.com 的邮箱，激活码填 {DEMO_ACTIVATION}</small>}
        {(error || (step === "email" && cloud.error)) && <p className="login-error" role="alert">{error || cloud.error}</p>}
        <div className="login-actions">
          {step !== "email" && <button type="button" className="login-secondary" disabled={working} onClick={changeEmail}>换个邮箱</button>}
          <button type="submit" className="login-primary" disabled={working}>
            {working ? "请稍等…" : step === "email" ? "发送验证码" : step === "code" ? "登录" : "激活"}
          </button>
        </div>
      </form>
    </main>
  );
}
