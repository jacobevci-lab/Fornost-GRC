"use client";

import { useEffect } from "react";

/** Reuses the governed AI surface without duplicating identity, state or permissions. */
export default function AiWorkspaceHost({ lang }: { lang: "tr" | "en" }) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("fornost:open-ai", { detail: { view: "portfolio" } }));
    return () => { window.dispatchEvent(new Event("fornost:close-ai-workspace")); };
  }, []);
  useEffect(() => { window.dispatchEvent(new CustomEvent("fornost:ai-workspace-locale", { detail: lang })); }, [lang]);
  return <section id="ai-governance-workspace" data-locale={lang} aria-label={lang === "tr" ? "AI Yönetişimi çalışma alanı" : "AI Governance workspace"} />;
}
