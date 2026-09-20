"use client";

import { useEffect } from "react";

const hardeningCss = `
:root{
  --ws-faint:#607071 !important;
  --ws-positive:#117a52 !important;
  --ws-warning:#8f4f12 !important;
  --ws-danger:#b4303c !important;
  --fornost-on-brand:#ffffff;
  --fornost-row-action:#425455;
  --fornost-warning-text:#9a4813;
  --fornost-positive-text:#0b6b48;
}
html[data-theme="dark"]{
  --ws-faint:#91a19f !important;
  --fornost-on-brand:#0b1717;
  --fornost-row-action:#c7d2d0;
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
  opacity:1 !important;
  filter:none !important;
}

/* Keep operational micro-copy readable. Legacy skins still contain 7-10px values,
   but the production surface must never render business text below 11px. */
.platform-state,
.aside-note b,.aside-note p,
.sidebar-view-controls>span,.sidebar-view-controls em,
.settings-page footer,.catalog-grid footer,
.workspace-dashboard footer{
  font-size:11px !important;
  line-height:1.4 !important;
}
.workspace-dashboard i:not(:empty){
  font-size:11px !important;
  line-height:1 !important;
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

/* Header controls must remain single-line and vertically centered at every width. */
.context-ai-trigger,.command-trigger,.theme-toggle,.language-switch button{
  white-space:nowrap !important;
  line-height:1 !important;
}
.language-switch button{
  min-height:32px !important;
  height:32px !important;
  padding:0 8px !important;
  display:grid !important;
  place-items:center !important;
}

/* Risk matrix may be wider than its analytics card. Make the overflow intentional,
   keyboard reachable and contained instead of clipping the right-most cells. */
.matrix-card{
  min-width:0 !important;
  overflow-x:auto !important;
  overflow-y:visible !important;
  overscroll-behavior-inline:contain;
}
.matrix-card>.matrix,.matrix-card .matrix{
  min-width:440px;
}

/* Long tab sets and data tables scroll inside their own surface instead of clipping text. */
.fornost-ai-panel,
.fornost-ai-tabs,
.rap-tabs,.plm-tabs,.tprm-tabs,.ri-tabs,
.continuity-table,.incident-table-wrap,.finding-table-wrap{
  max-width:100% !important;
  overflow:auto !important;
  overscroll-behavior:contain;
}

/* Tablet shell: compact the utility header before it collides with the workspace title. */
@media (min-width:901px) and (max-width:1180px){
  .shell:not(.sidebar-compact):not(.sidebar-hidden){
    grid-template-columns:248px minmax(0,1fr) !important;
  }
  .shell>main{padding-left:24px !important;padding-right:24px !important;}
  .shell>main>header{margin-left:-24px !important;margin-right:-24px !important;padding-left:24px !important;padding-right:24px !important;}
  .header-actions{gap:6px !important;flex:0 0 auto !important;}
  .header-live{display:none !important;}
  .context-ai-trigger b,.command-trigger span,.command-trigger kbd,
  .user b,.user small,.user>div{display:none !important;}
  .context-ai-trigger,.command-trigger,.theme-toggle{
    width:38px !important;
    min-width:38px !important;
    min-height:38px !important;
    padding:0 !important;
    display:grid !important;
    place-items:center !important;
  }
  .user{
    width:40px !important;
    min-width:40px !important;
    max-width:40px !important;
    padding:4px !important;
    justify-content:center !important;
  }
  .user>span{margin:0 !important;}
  :where(.rap-hero,.continuity-hero,.plm-hero,.tprm-hero,.ri-hero,.incident-hero,.finding-hero,.ea-hero,.connected-hero,.report-hero){
    min-width:0 !important;
    align-items:flex-start !important;
    flex-wrap:wrap !important;
  }
  :where(.rap-hero,.continuity-hero,.plm-hero,.tprm-hero,.ri-hero,.incident-hero,.finding-hero,.ea-hero,.connected-hero,.report-hero)>:last-child,
  .report-hero-actions{
    width:100% !important;
    max-width:100% !important;
    justify-content:flex-start !important;
    flex-wrap:wrap !important;
  }
}

/* A closed mobile drawer must be actually hidden, not merely translated off canvas.
   This prevents keyboard focus and removes phantom viewport-overflow findings. */
@media (max-width:900px){
  .shell:not(.mobile-nav-open)>aside{
    opacity:0 !important;
    visibility:hidden !important;
    pointer-events:none !important;
  }
  .shell.mobile-nav-open>aside{
    opacity:1 !important;
    visibility:visible !important;
    pointer-events:auto !important;
  }
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
      style?.remove();
    };
  }, []);
  return null;
}
