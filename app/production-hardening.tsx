"use client";

import { useEffect } from "react";

const hardeningCss = `
:root{
  --ws-faint:#607071 !important;
  --ws-positive:#117a52 !important;
  --ws-warning:#8f4f12 !important;
  --ws-danger:#b4303c !important;
  --fornost-on-brand:#ffffff;
}
html[data-theme="dark"]{
  --ws-faint:#91a19f !important;
  --fornost-on-brand:#0b1717;
}

/* Text that was visually too faint in compact navigation and dense workspaces. */
.brand small,.sidebar-view-controls>span,kbd,
.warning>span,.positive>span,.neutral>span,.danger>span,.info>span,
.risk>span,.compliance>span,.audit>span,.evidence>span,
.report-assurance-strip span,.fornost-ai-tab-group,
.row-actions button,.exposure-total>small,.priority-head>span,
.incident-toolbar>span,.finding-toolbar>span,.finding-source-strip small,
.readiness .miss,.coverage-count.miss,
.connected-grc :where(p,small,em,code),
.connected-grc aside :where(span,small),
.connected-grc .connected-table-head span{
  color:var(--ws-muted) !important;
}

/* Teal is intentionally bright in dark mode, therefore it needs dark foreground text. */
:where(.primary,.accent,.command-primary,.card-action){
  color:var(--fornost-on-brand) !important;
}
html[data-theme="dark"] :where(.primary,.accent,.command-primary,.card-action){
  text-shadow:none !important;
}

/* Preserve the amber dark-mode heading language while making it readable. */
html[data-theme="dark"] :where(.module-kicker,.connected-hero small,.connected-assurance>header small,.module-command-hero small){
  color:#f3a269 !important;
}
html:not([data-theme="dark"]) :where(.connected-hero small,.connected-assurance>header small,.module-command-hero small){
  color:var(--ws-brand-2) !important;
}
.executive-assurance-score>b{color:var(--ws-warning) !important;}
.off{color:var(--ws-danger) !important;}

/* Connected GRC previously inherited several legacy low-contrast tokens. */
.connected-grc{
  color:var(--ws-ink) !important;
}
.connected-grc :where(h2,h3,b,strong){color:var(--ws-ink) !important;}
.connected-grc :where(button,input,article,aside,.connected-register,.connected-assurance){
  border-color:var(--ws-line) !important;
}
.connected-grc :where(input,.connected-register,.connected-assurance,article){
  background-color:var(--ws-surface) !important;
}
.connected-grc button.active,
.connected-grc button:hover{
  color:var(--ws-brand-2) !important;
}

/* Minimum interactive hit areas without changing the visual density of tables. */
.row-actions button,.modal-head>button,.evidence-preview-head>button,
.theme-toggle,.language-switch button,.column-picker header button,
.connected-grc .connected-toolbar input{
  min-height:28px !important;
}
.column-resizer{
  width:24px !important;
  right:-12px !important;
  min-height:24px !important;
}

/* Keyboard focus for dynamically focusable scroll regions. */
[data-fornost-scroll-region="true"]:focus-visible{
  outline:2px solid var(--ws-brand) !important;
  outline-offset:-2px !important;
}
`;

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
    ".fornost-ai-mode,.fornost-ai-messages,.fornost-ai-compose,.table-wrap,.audit-control-list,.connected-table,form",
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
}

export default function ProductionHardening() {
  useEffect(() => {
    let style = document.getElementById("fornost-production-hardening") as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "fornost-production-hardening";
      style.textContent = hardeningCss;
      document.head.appendChild(style);
    }

    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        hardenDom();
      });
    };
    hardenDom();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("pointerup", schedule, true);
    document.addEventListener("keyup", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("fornost:open-ai", schedule as EventListener);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerup", schedule, true);
      document.removeEventListener("keyup", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("fornost:open-ai", schedule as EventListener);
      style?.remove();
    };
  }, []);
  return null;
}
