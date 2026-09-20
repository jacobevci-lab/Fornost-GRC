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

export default function NavigationIntegrity() {
  useEffect(() => {
    const onNavClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("nav button[aria-label]") : null;
      if (!target) return;
      const label = target.getAttribute("aria-label")?.trim();
      if (!label || AI_LABELS.has(label)) return;

      /*
       * The AI workspace can intentionally stay open while the user navigates elsewhere.
       * ProductionHardening previously kept the AI item selected as long as that panel was
       * visible. Tell it which real module should be restored, then remove the AI override.
       */
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
