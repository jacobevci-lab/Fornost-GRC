"use client";

import { useEffect } from "react";
import { withBasePath } from "./base-path";
import { sameDomainModule } from "./domain-identity";
import {
  FORNOST_FOCUS_EVENT,
  consumePendingFornostFocus,
  peekPendingFornostFocus,
  type FornostNavigationRequest,
} from "./navigation-focus";
import "./navigation-focus-bridge.css";

const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const normalize = (value: unknown) => clean(value).toLocaleLowerCase("tr-TR");
const automationFindingTitles = new Map<string, string>();
let automationFindingLookupPending = false;
let automationFindingLookupAt = 0;

function activeModuleMatches(module: string) {
  const active = document.querySelector<HTMLButtonElement>("#fornost-navigation .nav-group-items > button.active[aria-label]");
  return Boolean(active && sameDomainModule(active.getAttribute("aria-label"), module));
}

function focusValue(request: FornostNavigationRequest) {
  const preferredFilterKeys = ["recordRef", "controlRef", "riskRef", "evidenceRef", "findingRef", "sourceRef", "ruleRef", "id"];
  for (const key of preferredFilterKeys) {
    const value = clean(request.filter?.[key]);
    if (value) return value;
  }
  return clean(request.ref);
}

function setControlledInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setControlledSelectValue(select: HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function exactMatchingRow(rows: HTMLTableRowElement[], value: string) {
  const needle = normalize(value);
  if (!needle) return null;
  return rows.find((row) => {
    if (Array.from(row.cells).some((cell) => normalize(cell.textContent) === needle)) return true;
    return Array.from(row.querySelectorAll<HTMLElement>("[title]")).some((node) => normalize(node.getAttribute("title")) === needle);
  }) || null;
}

function matchingRow(rows: HTMLTableRowElement[], value: string) {
  const needle = normalize(value);
  if (!needle) return null;
  const exact = exactMatchingRow(rows, value);
  return exact || rows.find((row) => normalize(row.textContent).includes(needle)) || null;
}

function highlightRows(rows: HTMLTableRowElement[], match: HTMLTableRowElement) {
  for (const row of rows) row.classList.remove("fornost-focus-row");
  match.classList.add("fornost-focus-row");
  match.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  window.setTimeout(() => match.classList.remove("fornost-focus-row"), 6_000);
}

function registerRows() {
  return Array.from(document.querySelectorAll<HTMLTableRowElement>("main .table-card .table-wrap tbody tr"));
}

function highlightMatchingRow(value: string, exactOnly = false) {
  const rows = registerRows();
  const match = exactOnly ? exactMatchingRow(rows, value) : matchingRow(rows, value);
  if (!match) return false;
  highlightRows(rows, match);
  return true;
}

function applyFindingFocus(value: string) {
  const page = document.querySelector<HTMLElement>("main .finding-page");
  if (!page) return false;

  const search = page.querySelector<HTMLInputElement>(".finding-toolbar input");
  const status = page.querySelector<HTMLSelectElement>(".finding-toolbar select");
  if (!search || !status) return false;

  if (status.value !== "all") {
    setControlledSelectValue(status, "all");
    return false;
  }
  if (search.value !== value) {
    setControlledInputValue(search, value);
    return false;
  }

  const rows = Array.from(page.querySelectorAll<HTMLTableRowElement>(".finding-table tbody tr"));
  const match = matchingRow(rows, value);
  if (!match) return false;

  highlightRows(rows, match);
  match.click();
  return true;
}

function evidenceAutomationTab(request: FornostNavigationRequest) {
  if (clean(request.filter?.findingRef)) return 4;
  if (clean(request.filter?.ruleRef)) return 2;
  if (clean(request.filter?.sourceRef)) return 1;
  if (clean(request.filter?.evidenceRef)) return 3;
  return 4;
}

function refreshAutomationFindingAliases() {
  const now = Date.now();
  if (automationFindingLookupPending || now - automationFindingLookupAt < 5_000) return;
  automationFindingLookupPending = true;
  automationFindingLookupAt = now;
  void fetch(withBasePath("/api/evidence-automation"), { cache: "no-store", headers: { accept: "application/json" } })
    .then(async (response) => response.ok ? response.json() : {})
    .then((body: { findings?: Array<{ id?: string; title?: string }> }) => {
      for (const finding of body.findings || []) {
        const id = clean(finding.id);
        const title = clean(finding.title);
        if (id && title) automationFindingTitles.set(id, title);
      }
    })
    .catch(() => {})
    .finally(() => { automationFindingLookupPending = false; });
}

function evidenceAutomationFocusValue(request: FornostNavigationRequest, value: string) {
  if (!clean(request.filter?.findingRef)) return value;
  const resolved = automationFindingTitles.get(value);
  if (resolved) return resolved;
  refreshAutomationFindingAliases();
  return value;
}

function applyEvidenceAutomationFocus(request: FornostNavigationRequest, value: string) {
  const page = document.querySelector<HTMLElement>("main .ea-page");
  if (!page) return false;
  const tabs = Array.from(page.querySelectorAll<HTMLButtonElement>(".ea-tabs > button"));
  const index = evidenceAutomationTab(request);
  const targetTab = tabs[index];
  if (!targetTab) return false;
  if (!targetTab.classList.contains("active")) {
    targetTab.click();
    return false;
  }
  const rows = Array.from(page.querySelectorAll<HTMLTableRowElement>(".ea-table tbody tr"));
  const resolvedValue = evidenceAutomationFocusValue(request, value);
  const match = matchingRow(rows, resolvedValue);
  if (!match) return false;
  highlightRows(rows, match);
  return true;
}

function applyFocus(request: FornostNavigationRequest) {
  if (!activeModuleMatches(request.module)) return false;
  const value = focusValue(request);
  if (!value) return false;

  if (sameDomainModule(request.module, "Bulgular ve CAPA")) {
    return applyFindingFocus(value);
  }
  if (sameDomainModule(request.module, "Kanıt Otomasyonu")) {
    return applyEvidenceAutomationFocus(request, value);
  }

  const search = document.querySelector<HTMLInputElement>("main .table-card .register-search input");
  if (!search) return false;

  // Governed record ids are intentionally not rendered as visible text in every register.
  // Resolve the row from exact cell text or hidden title metadata before changing the local search filter.
  if (highlightMatchingRow(value, true)) {
    search.focus({ preventScroll: true });
    return true;
  }

  if (search.value !== value) {
    setControlledInputValue(search, value);
    search.focus({ preventScroll: true });
    return false;
  }

  search.focus({ preventScroll: true });
  return highlightMatchingRow(value);
}

export default function NavigationFocusBridge() {
  useEffect(() => {
    let retryTimer = 0;
    let attempts = 0;
    let current: FornostNavigationRequest | null = null;

    const stop = () => {
      if (retryTimer) window.clearTimeout(retryTimer);
      retryTimer = 0;
      attempts = 0;
    };

    const tryApply = () => {
      if (!current) return;
      attempts += 1;
      if (applyFocus(current)) {
        consumePendingFornostFocus(current.module);
        stop();
        return;
      }
      if (attempts >= 30) {
        stop();
        return;
      }
      retryTimer = window.setTimeout(tryApply, 90);
    };

    const schedule = (request: FornostNavigationRequest | null) => {
      if (!request || !clean(request.module) || !focusValue(request)) return;
      stop();
      current = request;
      tryApply();
    };

    const onFocus = (event: Event) => {
      schedule((event as CustomEvent<FornostNavigationRequest>).detail || null);
    };

    window.addEventListener(FORNOST_FOCUS_EVENT, onFocus as EventListener);
    schedule(peekPendingFornostFocus());

    return () => {
      stop();
      window.removeEventListener(FORNOST_FOCUS_EVENT, onFocus as EventListener);
    };
  }, []);

  return null;
}
