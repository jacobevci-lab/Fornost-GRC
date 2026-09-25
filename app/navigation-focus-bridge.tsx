"use client";

import { useEffect } from "react";
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

function activeModuleMatches(module: string) {
  const active = document.querySelector<HTMLButtonElement>("#fornost-navigation .nav-group-items > button.active[aria-label]");
  return Boolean(active && sameDomainModule(active.getAttribute("aria-label"), module));
}

function focusValue(request: FornostNavigationRequest) {
  const preferredFilterKeys = ["recordRef", "controlRef", "riskRef", "evidenceRef", "findingRef", "sourceRef", "id"];
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

function matchingRow(rows: HTMLTableRowElement[], value: string) {
  const needle = normalize(value);
  if (!needle) return null;
  const exact = rows.find((row) => Array.from(row.cells).some((cell) => normalize(cell.textContent) === needle));
  return exact || rows.find((row) => normalize(row.textContent).includes(needle)) || null;
}

function highlightMatchingRow(value: string) {
  const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>("main .table-card .table-wrap tbody tr"));
  const match = matchingRow(rows, value);
  if (!match) return false;

  for (const row of rows) row.classList.remove("fornost-focus-row");
  match.classList.add("fornost-focus-row");
  match.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  window.setTimeout(() => match.classList.remove("fornost-focus-row"), 6_000);
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

  for (const row of rows) row.classList.remove("fornost-focus-row");
  match.classList.add("fornost-focus-row");
  match.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  match.click();
  window.setTimeout(() => match.classList.remove("fornost-focus-row"), 6_000);
  return true;
}

function applyFocus(request: FornostNavigationRequest) {
  if (!activeModuleMatches(request.module)) return false;
  const value = focusValue(request);
  if (!value) return false;

  if (sameDomainModule(request.module, "Bulgular ve CAPA")) {
    return applyFindingFocus(value);
  }

  const search = document.querySelector<HTMLInputElement>("main .table-card .register-search input");
  if (!search) return false;

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
      if (attempts >= 18) {
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
