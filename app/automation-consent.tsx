"use client";

// The question the app asks before the command line gets a 秘密 (clipbox-automation.ts). One question at a time: a second
// request while one is open is refused, and an unanswered question is refused after SECRET_CONSENT_MS.
import { useCallback, useRef, useState } from "react";
import { AutomationConsentDialog } from "./dialogs";
import { SECRET_CONSENT_MS, secretConsentQuestion, type SecretAutomationAction } from "./clipbox-automation";

export function useAutomationConsent() {
  const [question, setQuestion] = useState<{ text: string; finish: (allowed: boolean) => void } | null>(null);
  const openRef = useRef(false);
  const ask = useCallback((action: SecretAutomationAction) => new Promise<boolean>((resolve) => {
    if (openRef.current) return resolve(false);
    openRef.current = true;
    let done = false;
    const finish = (allowed: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      openRef.current = false;
      setQuestion(null);
      resolve(allowed);
    };
    const timer = window.setTimeout(() => finish(false), SECRET_CONSENT_MS);
    setQuestion({ text: secretConsentQuestion(action), finish });
  }), []);
  const dialog = question ? <AutomationConsentDialog question={question.text} onAnswer={question.finish} /> : null;
  return { ask, dialog };
}
