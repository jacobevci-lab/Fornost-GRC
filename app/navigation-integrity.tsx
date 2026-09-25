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

function simplifyPrimaryNavigation() {
  /*
   * Ask Fornost is a global action in the workspace header. Keeping the same action
   * as a sidebar module creates two competing entry points and makes the product
   * look more complex than it is. Preserve the underlying module and command-palette
   * route, but remove the redundant sidebar button from the primary navigation.
   */
  document
    .querySelectorAll<HTMLButtonElement>('nav button[aria-label="Ask Fornost"]')
    .forEach((button) => {
      button.hidden = true;
      button.dataset.fornostRedundantNav = "true";
    });
}

export default function NavigationIntegrity() {
  useEffect(() => {
    simplifyPrimaryNavigation();
    const navigationObserver = new MutationObserver(simplifyPrimaryNavigation);
    navigationObserver.observe(document.body, { childList: true, subtree: true });

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
    return () => {
      navigationObserver.disconnect();
      document.removeEventListener("click", onNavClick, true);
    };
  }, []);

  return null;
}
