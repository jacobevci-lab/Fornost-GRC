"use client";

import { useEffect } from "react";

function hasAccessibleName(element: Element) {
  if (element.getAttribute("aria-label") || element.getAttribute("aria-labelledby")) return true;
  const id = element.getAttribute("id");
  if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return true;
  return Boolean(element.closest("label"));
}

function nearbyHeading(element: Element) {
  const container = element.closest("section,article,form,aside,main,div");
  return container?.querySelector("h1,h2,h3,h4,legend")?.textContent?.trim() || "";
}

function isVisible(element: HTMLElement) {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none"
    && style.visibility !== "hidden"
    && Number(style.opacity) !== 0
    && rect.width > 0
    && rect.height > 0;
}

function syncMobileNavigation() {
  const shell = document.querySelector<HTMLElement>(".shell");
  const aside = shell?.querySelector<HTMLElement>(":scope > aside");
  if (!shell || !aside) return;
  const mobile = window.matchMedia("(max-width: 900px)").matches;
  if (!mobile) {
    aside.removeAttribute("aria-hidden");
    aside.removeAttribute("inert");
    return;
  }
  const open = shell.classList.contains("mobile-nav-open");
  aside.setAttribute("aria-hidden", open ? "false" : "true");
  aside.toggleAttribute("inert", !open);
}

function syncAiNavigation() {
  const root = document.documentElement;
  const targetKey = root.dataset.fornostAiNavTarget;
  const panel = [...document.querySelectorAll<HTMLElement>(".fornost-ai-panel")].find(isVisible);
  const navButtons = [...document.querySelectorAll<HTMLElement>("nav button[aria-label]")];

  if (!targetKey || !panel) {
    const previous = root.dataset.fornostPrevActiveNav;
    if (previous) {
      navButtons.forEach((button) => {
        const restore = button.getAttribute("aria-label") === previous;
        button.classList.toggle("active", restore);
        if (restore) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      delete root.dataset.fornostPrevActiveNav;
    }
    if (!panel) delete root.dataset.fornostAiNavTarget;
    return;
  }

  const labels = targetKey === "ai-governance"
    ? ["AI Yönetişimi", "AI Governance"]
    : ["Ask Fornost"];
  const target = navButtons.find((button) => labels.includes(button.getAttribute("aria-label") || ""));
  if (!target) return;

  if (!root.dataset.fornostPrevActiveNav) {
    root.dataset.fornostPrevActiveNav = navButtons.find((button) => button.classList.contains("active"))?.getAttribute("aria-label") || "";
  }
  navButtons.forEach((button) => {
    const active = button === target;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function hardenClippedLabels() {
  document.querySelectorAll<HTMLElement>("body *").forEach((element) => {
    if (!isVisible(element) || element.hasAttribute("title") || element.hasAttribute("aria-label")) return;
    const text = element.textContent?.replace(/\s+/g, " ").trim();
    if (!text || text.length > 240) return;
    const style = getComputedStyle(element);
    const clipped = element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2;
    if (!clipped || style.textOverflow !== "ellipsis") return;
    element.setAttribute("title", text);
  });
}

function hardenDom() {
  document.querySelectorAll<HTMLElement>('.column-resizer[role="separator"]').forEach((separator) => {
    const width = Math.max(96, Math.min(640, Math.round(separator.closest("th")?.getBoundingClientRect().width || 190)));
    separator.setAttribute("aria-valuemin", "96");
    separator.setAttribute("aria-valuemax", "640");
    separator.setAttribute("aria-valuenow", String(width));
    separator.setAttribute("aria-valuetext", `${width} px`);
  });

  document.querySelectorAll<HTMLElement>(".risk-stack[aria-label]").forEach((chart) => {
    if (!chart.getAttribute("role")) chart.setAttribute("role", "img");
  });

  document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea").forEach((control) => {
    if (control.type === "hidden" || hasAccessibleName(control)) return;
    const fallback = control.getAttribute("placeholder")?.trim()
      || control.getAttribute("name")?.replace(/[_-]+/g, " ")
      || nearbyHeading(control)
      || (control.tagName === "TEXTAREA" ? "Text input" : control.tagName === "SELECT" ? "Selection" : "Input");
    control.setAttribute("aria-label", fallback);
  });

  const candidates = document.querySelectorAll<HTMLElement>(
    ".fornost-ai-panel,.fornost-ai-mode,.fornost-ai-messages,.fornost-ai-compose,.ai-portfolio,.matrix-card,.fornost-ai-tabs,.rap-tabs,.plm-tabs,.tprm-tabs,.ri-tabs,.table-wrap,.audit-control-list,.connected-table,.continuity-table,.incident-table-wrap,.finding-table-wrap,form",
  );
  candidates.forEach((element) => {
    const style = getComputedStyle(element);
    const canScroll = element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1;
    const overflowAllowsScroll = /auto|scroll/.test(`${style.overflow}${style.overflowX}${style.overflowY}`);
    if (!canScroll || !overflowAllowsScroll || element.tabIndex >= 0) return;
    element.tabIndex = 0;
    element.dataset.fornostScrollRegion = "true";
    if (!hasAccessibleName(element)) {
      element.setAttribute("aria-label", nearbyHeading(element) || "Scrollable content");
    }
  });

  document.querySelectorAll<HTMLElement>('button,input[type="checkbox"],input[type="radio"]').forEach((control) => {
    if (!isVisible(control) || control.classList.contains("fornost-hit-target")) return;
    const rect = control.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 24) control.classList.add("fornost-hit-target");
  });

  syncMobileNavigation();
  syncAiNavigation();
  hardenClippedLabels();
}

export default function ProductionHardening() {
  useEffect(() => {
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        hardenDom();
      });
    };
    const onOpenAi = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail || {};
      if (detail.module) return;
      if (detail.view === "portfolio") document.documentElement.dataset.fornostAiNavTarget = "ai-governance";
      else if (detail.mode === "chat") document.documentElement.dataset.fornostAiNavTarget = "ask-fornost";
      schedule();
    };

    hardenDom();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "aria-hidden"] });
    document.addEventListener("pointerup", schedule, true);
    document.addEventListener("keyup", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("fornost:open-ai", onOpenAi as EventListener);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerup", schedule, true);
      document.removeEventListener("keyup", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("fornost:open-ai", onOpenAi as EventListener);
      delete document.documentElement.dataset.fornostAiNavTarget;
      delete document.documentElement.dataset.fornostPrevActiveNav;
    };
  }, []);
  return null;
}
