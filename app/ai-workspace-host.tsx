"use client";

import { useEffect } from "react";
import { aiRecordViews, resolveAiRecordFocus } from './ai-record-navigation';
import { peekPendingFornostFocus, consumePendingFornostFocus, FORNOST_FOCUS_EVENT, type FornostNavigationRequest } from './navigation-focus';

/** Reuses the governed AI surface without duplicating identity, state or permissions. */
export default function AiWorkspaceHost({ lang }: { lang: "tr" | "en" }) {
  useEffect(() => {
    const accept = (request: FornostNavigationRequest | null) => {
      const recordFocus = resolveAiRecordFocus(request);
      if (!recordFocus) return false;
      consumePendingFornostFocus('AI Yönetişimi');
      window.dispatchEvent(new CustomEvent('fornost:open-ai', { detail: { view: aiRecordViews[recordFocus.kind], recordFocus } }));
      return true;
    };
    if (!accept(peekPendingFornostFocus())) window.dispatchEvent(new CustomEvent("fornost:open-ai", { detail: { view: "portfolio" } }));
    const listener = (event: Event) => accept((event as CustomEvent<FornostNavigationRequest>).detail);
    window.addEventListener(FORNOST_FOCUS_EVENT, listener);
    return () => { window.removeEventListener(FORNOST_FOCUS_EVENT, listener); window.dispatchEvent(new Event("fornost:close-ai-workspace")); };
  }, []);
  useEffect(() => { window.dispatchEvent(new CustomEvent("fornost:ai-workspace-locale", { detail: lang })); }, [lang]);
  return <section id="ai-governance-workspace" data-locale={lang} aria-label={lang === "tr" ? "AI Yönetişimi çalışma alanı" : "AI Governance workspace"} />;
}
