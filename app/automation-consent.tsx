"use client";

// The question the app asks before the command line gets a 秘密 (clipbox-automation.ts). One question at a time: a second
// request while one is open is refused, and an unanswered question is refused after SECRET_CONSENT_MS.
// A program the person marked 「始终允许」 reads or checks a 秘密 without the question (D-059, automation-trust.ts).
import { useCallback, useRef, useState } from "react";
import { AutomationConsentDialog } from "./dialogs";
import { SECRET_CONSENT_MS, secretConsentQuestion, type SecretAutomationAction } from "./clipbox-automation";
import { isTrustedCaller, readTrustedCallers, trustCovers, withTrustedCaller, writeTrustedCallers, type AutomationCaller } from "./automation-trust";

export type ConsentAnswer = "denied" | "once" | "always" | "remembered";
type Question = { text: string; caller: AutomationCaller | null; canAlways: boolean; finish: (answer: ConsentAnswer) => void };

export function useAutomationConsent() {
  const [question, setQuestion] = useState<Question | null>(null);
  const openRef = useRef(false);
  const ask = useCallback((action: SecretAutomationAction, caller: AutomationCaller | null = null) => new Promise<ConsentAnswer>((resolve) => {
    const canAlways = !!caller && trustCovers(action);
    if (canAlways && isTrustedCaller(readTrustedCallers(), caller)) return resolve("remembered");
    if (openRef.current) return resolve("denied");
    openRef.current = true;
    let done = false;
    const finish = (answer: ConsentAnswer) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      openRef.current = false;
      setQuestion(null);
      if (answer === "always" && caller && canAlways) {
        try { writeTrustedCallers(withTrustedCaller(readTrustedCallers(), caller, Date.now())); } catch { /* still allowed this once */ }
      }
      resolve(answer);
    };
    const timer = window.setTimeout(() => finish("denied"), SECRET_CONSENT_MS);
    setQuestion({ text: secretConsentQuestion(action), caller, canAlways, finish });
  }), []);
  const dialog = question
    ? <AutomationConsentDialog question={question.text} callerName={question.caller?.name} canAlways={question.canAlways} onAnswer={question.finish} />
    : null;
  return { ask, dialog };
}
