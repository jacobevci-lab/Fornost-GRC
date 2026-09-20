"use client";

import { useEffect } from "react";

const hardeningCss = `
:root{
  --ws-faint:#607071 !important;
  --ws-positive:#117a52 !important;
  --ws-warning:#8f4f12 !important;
  --ws-danger:#b4303c !important;
  --fornost-on-brand:#ffffff;
  --fornost-row-action:#536568;
  --fornost-warning-text:#9a4813;
  --fornost-positive-text:#0b6b48;
}
html[data-theme="dark"]{
  --ws-faint:#91a19f !important;
  --fornost-on-brand:#0b1717;
  --fornost-row-action:#aab8b6;
  --fornost-warning-text:#f3a269;
  --fornost-positive-text:#65d7a6;
}

/* Text that was visually too faint in compact navigation and dense workspaces. */
.brand small,.sidebar-view-controls>span,kbd,
.warning>span,.positive>span,.neutral>span,.danger>span,.info>span,
.risk>span,.compliance>span,.audit>span,.evidence>span,
.report-assurance-strip span,.fornost-ai-tab-group,
.exposure-total>small,.priority-head>span,
.incident-toolbar>span,.finding-toolbar>span,.finding-source-strip small,
.readiness .miss,.coverage-count.miss,
.connected-grc :where(p,small,em,code),
.connected-grc aside :where(span,small),
.connected-grc .connected-table-head span{
  color:var(--ws-muted) !important;
}
.row-actions button{
  color:var(--fornost-row-action) !important;
}

/* Legacy orange micro-labels failed WCAG contrast on white surfaces. */
.rap-grid>section>header small,
.plm-grid>section>header small{
  color:#a64b0b !important;
}

/* Dashboard priority chips need darker text in light mode. */
.priority-table em.yüksek{
  color:#9a4315 !important;
}

/* AI settings used opacity to mute already-muted copy, dropping it below AA. */
.fornost-ai-policy-grid small,
.fornost-ai-policy-roles>small{
  opacity:1 !important;
  color:#586b6c !important;
}

/* Master-data count chips keep the teal language with AA-readable text. */
.catalog-grid article>header span{
  color:#075f5a !important;
  background:color-mix(in srgb,var(--ws-brand) 16%,var(--ws-surface)) !important;
}

/* Teal is intentionally bright in dark mode, therefore it needs dark foreground text. */
:where(.primary,.accent,.command-primary,.card-action){
  color:var(--fornost-on-brand) !important;
}
html[data-theme="dark"] :where(.primary,.accent,.command-primary,.card-action){
  text-shadow:none !important;
}
html[data-theme="dark"] button.primary,
html[data-theme="dark"] a.primary,
html[data-theme="dark"] .actions>.primary,
html[data-theme="dark"] .audit-portfolio-empty>.primary,
html[data-theme="dark"] footer>.primary,
html[data-theme="dark"] button.card-action,
html[data-theme="dark"] .report-module-picker button.active>b,
html[data-theme="dark"] button.active>b{
  color:#0b1717 !important;
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
html[data-theme="dark"] .executive-assurance-score>b,
html[data-theme="dark"] .assurance-state.attention,
html[data-theme="dark"] .control-assurance-reasons>span{
  color:var(--fornost-warning-text) !important;
}
html[data-theme="dark"] .priority-table em.yüksek{
  color:#ffb27a !important;
}
html[data-theme="dark"] .fornost-ai-policy-grid small,
html[data-theme="dark"] .fornost-ai-policy-roles>small{
  color:#aab8b6 !important;
}
html[data-theme="dark"] .settings-security-overview li>b,
html[data-theme="dark"] .security-note>b{
  color:var(--fornost-positive-text) !important;
}

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

/* Minimum interaction targets: visual density stays compact, hit areas meet the QA floor. */
.row-actions button,.modal-head>button,.evidence-preview-head>button,
.theme-toggle,.language-switch button,.column-picker header button,
.connected-grc .connected-toolbar input{
  min-height:28px !important;
}
.fornost-hit-target{
  min-width:28px !important;
  min-height:28px !important;
}
input.fornost-hit-target[type="checkbox"],
input.fornost-hit-target[type="radio"]{
  width:24px !important;
  height:24px !important;
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

function isVisible(element: HTMLElement) {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none"
    && style.visibility !== "hidden"
    && Number(style.opacity) !== 0
    && rect.width > 0
    && rect.height > 0;
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
    ".fornost-ai-mode,.fornost-ai-messages,.fornost-ai-compose,.ai-portfolio,.table-wrap,.audit-control-list,.connected-table,form",
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
