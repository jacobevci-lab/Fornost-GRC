"use client";

import { useEffect } from "react";

const AI_LABELS = new Set(["Ask Fornost", "AI Yönetişimi", "AI Governance"]);

function setActiveNav(label: string) {
  document.querySelectorAll<HTMLElement>("nav button[aria-label]").forEach((button) => {
    const active = button.getAttribute("aria-label") === label;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function closeAiWorkspaceForModuleNavigation() {
  const panel = document.getElementById("fornost-ai-panel");
  if (!panel) return;
  const closeButton = panel.querySelector<HTMLElement>(
    'button[aria-label="Kapat"], button[aria-label="Close"]',
  );
  closeButton?.click();
}

export default function NavigationIntegrity() {
  useEffect(() => {
    const onNavClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("nav button[aria-label]") : null;
      if (!target) return;
      const label = target.getAttribute("aria-label")?.trim();
      if (!label || AI_LABELS.has(label)) return;

      /*
       * A normal module navigation must restore the real workspace both visually and
       * interactively. Leaving the full AI panel open on mobile hid the next module
       * even though the sidebar state had already moved on.
       */
      closeAiWorkspaceForModuleNavigation();

      const root = document.documentElement;
      root.dataset.fornostPrevActiveNav = label;
      delete root.dataset.fornostAiNavTarget;

      requestAnimationFrame(() => {
        setActiveNav(label);
        delete root.dataset.fornostAiNavTarget;
      });
    };

    document.addEventListener("click", onNavClick, true);
    return () => document.removeEventListener("click", onNavClick, true);
  }, []);

  return null;
}
