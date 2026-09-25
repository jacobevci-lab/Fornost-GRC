"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "./progressive-form-experience.css";

type Lang = "tr" | "en";
type Target = { form: HTMLFormElement; actions: HTMLElement; labels: HTMLLabelElement[] };

function currentLanguage(): Lang {
  return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase() === "en" ? "en" : "tr";
}

function discoverTarget(): Target | null {
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>(
    ".overlay .modal:not(.audit-picker):not(.import-modal) form.form",
  ));
  const form = forms.find(candidate => candidate.offsetParent !== null) || forms[0];
  if (!form) return null;
  const actions = form.querySelector<HTMLElement>(":scope > .form-actions");
  if (!actions) return null;
  const labels = Array.from(form.children).filter((child): child is HTMLLabelElement => child instanceof HTMLLabelElement);
  if (labels.length < 10) return null;
  return { form, actions, labels };
}

function partition(labels: HTMLLabelElement[]) {
  const required = labels.filter(label => Boolean(label.querySelector("input[required],select[required],textarea[required]")));
  const core = new Set<HTMLLabelElement>(required);
  for (const label of labels) {
    if (core.size >= 7) break;
    core.add(label);
  }
  return {
    core: labels.filter(label => core.has(label)),
    advanced: labels.filter(label => !core.has(label)),
  };
}

export default function ProgressiveFormExperience() {
  const [target, setTarget] = useState<Target | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("tr");

  useEffect(() => {
    const discover = () => {
      setLang(currentLanguage());
      const next = discoverTarget();
      setTarget(current => current?.form === next?.form && current?.labels.length === next?.labels.length ? current : next);
    };
    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true });
    const onClick = () => setLang(currentLanguage());
    document.addEventListener("click", onClick);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(() => {
    setAdvancedOpen(false);
  }, [target?.form]);

  const groups = useMemo(() => target ? partition(target.labels) : null, [target]);

  useEffect(() => {
    if (!target || !groups) return;
    target.form.classList.add("fornost-progressive-form");
    groups.core.forEach(label => {
      label.classList.add("fornost-core-field");
      label.classList.remove("fornost-advanced-field", "fornost-progressive-hidden");
    });
    groups.advanced.forEach(label => {
      label.classList.add("fornost-advanced-field");
      label.classList.toggle("fornost-progressive-hidden", !advancedOpen);
    });
    return () => {
      target.form.classList.remove("fornost-progressive-form");
      target.labels.forEach(label => label.classList.remove("fornost-core-field", "fornost-advanced-field", "fornost-progressive-hidden"));
    };
  }, [target, groups, advancedOpen]);

  if (!target || !groups || !groups.advanced.length) return null;
  const tr = lang === "tr";
  return createPortal(
    <div className="fornost-progressive-controls">
      <div>
        <b>{tr ? "Temel alanlar" : "Core fields"}</b>
        <small>
          {tr
            ? `${groups.core.length} temel · ${groups.advanced.length} gelişmiş alan`
            : `${groups.core.length} core · ${groups.advanced.length} advanced fields`}
        </small>
      </div>
      <button
        type="button"
        className={advancedOpen ? "active" : ""}
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen(value => !value)}
      >
        {advancedOpen ? (tr ? "Gelişmiş alanları gizle" : "Hide advanced") : (tr ? "Gelişmiş alanları göster" : "Show advanced")}
        <span aria-hidden="true">{advancedOpen ? "↑" : "↓"}</span>
      </button>
    </div>,
    target.actions,
  );
}
