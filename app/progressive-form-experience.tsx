"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { sameDomainModule } from "./domain-identity";
import "./progressive-form-experience.css";

type Lang = "tr" | "en";
type Target = { form: HTMLFormElement; actions: HTMLElement; labels: HTMLLabelElement[]; quickRisk: boolean; newRecord: boolean };

function currentLanguage(): Lang {
  return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase() === "en" ? "en" : "tr";
}

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("tr-TR");
}

function labelCaption(label: HTMLLabelElement) {
  return normalize(label.childNodes[0]?.textContent || "");
}

function isQuickRiskCoreLabel(label: HTMLLabelElement) {
  return ["başlık / ad", "title / name", "sahibi", "owner", "ilgili varlık", "related asset"].includes(labelCaption(label));
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
  const modal = form.closest(".modal");
  const heading = modal?.querySelector(".modal-head h2")?.textContent || "";
  const mode = normalize(modal?.querySelector(".modal-head small")?.textContent);
  return {
    form,
    actions,
    labels,
    quickRisk: sameDomainModule(heading, "Risk Assessment"),
    newRecord: ["yeni kayıt", "new record"].includes(mode),
  };
}

function partition(target: Target) {
  const { labels, quickRisk } = target;
  if (quickRisk) {
    const core = new Set(labels.filter(isQuickRiskCoreLabel));
    return {
      core: labels.filter(label => core.has(label)),
      advanced: labels.filter(label => !core.has(label)),
    };
  }
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

function relaxQuickRiskRequirements(labels: HTMLLabelElement[]) {
  for (const label of labels) {
    for (const field of label.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input[required],select[required],textarea[required]")) {
      field.dataset.fornostProgressiveRequired = "true";
      field.removeAttribute("required");
    }
  }
}

function restoreQuickRiskRequirements(labels: HTMLLabelElement[]) {
  for (const label of labels) {
    for (const field of label.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-fornost-progressive-required='true']")) {
      field.required = true;
      delete field.dataset.fornostProgressiveRequired;
    }
  }
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function primeQuickRiskStatus(target: Target) {
  if (!target.quickRisk || !target.newRecord) return;
  const statusLabel = target.labels.find(label => ["durum", "status"].includes(labelCaption(label)));
  const status = statusLabel?.querySelector<HTMLSelectElement>("select");
  if (!status) return;
  const intakeStatus = "Değerlendiriliyor";
  if (!Array.from(status.options).some(option => option.value === intakeStatus)) return;
  if (status.value !== intakeStatus) setSelectValue(status, intakeStatus);
}

export default function ProgressiveFormExperience() {
  const [target, setTarget] = useState<Target | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("tr");

  useEffect(() => {
    const discover = () => {
      setLang(currentLanguage());
      const next = discoverTarget();
      setTarget(current => current?.form === next?.form && current?.labels.length === next?.labels.length && current?.quickRisk === next?.quickRisk && current?.newRecord === next?.newRecord ? current : next);
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

  const groups = useMemo(() => target ? partition(target) : null, [target]);

  useEffect(() => {
    if (!target || !groups) return;
    target.form.classList.add("fornost-progressive-form");
    if (target.quickRisk) {
      relaxQuickRiskRequirements(groups.advanced);
      primeQuickRiskStatus(target);
    }
    groups.core.forEach(label => {
      label.classList.add("fornost-core-field");
      label.classList.remove("fornost-advanced-field", "fornost-progressive-hidden");
    });
    groups.advanced.forEach(label => {
      label.classList.add("fornost-advanced-field");
      label.classList.toggle("fornost-progressive-hidden", !advancedOpen);
    });
    return () => {
      if (target.quickRisk) restoreQuickRiskRequirements(groups.advanced);
      target.form.classList.remove("fornost-progressive-form");
      target.labels.forEach(label => label.classList.remove("fornost-core-field", "fornost-advanced-field", "fornost-progressive-hidden"));
    };
  }, [target, groups, advancedOpen]);

  if (!target || !groups || !groups.advanced.length) return null;
  const tr = lang === "tr";
  return createPortal(
    <div className="fornost-progressive-controls">
      <div>
        <b>{target.quickRisk ? (tr ? "Hızlı risk kaydı" : "Quick risk intake") : (tr ? "Temel alanlar" : "Core fields")}</b>
        <small>
          {target.quickRisk
            ? (tr ? "Olay · etkilenen varlık · sahip ile kaydet; değerlendirmeyi sonra tamamla" : "Save with event · affected asset · owner; complete assessment later")
            : (tr
                ? `${groups.core.length} temel · ${groups.advanced.length} gelişmiş alan`
                : `${groups.core.length} core · ${groups.advanced.length} advanced fields`)}
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
