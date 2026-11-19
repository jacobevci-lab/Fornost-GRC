"use client";

import { useContext, useMemo } from "react";
import { ModuleTrailContext } from "../module-record-trail-view";
import { FindingReferencePicker } from "../findings/reference-picker";
import { findingTargets, savedFindingTarget, type FindingReferenceField, type FindingTarget } from "../findings/record-references";

type Props = {
  field: FindingReferenceField;
  tr: boolean;
  value: string;
  onChange: (refs: string) => void;
};

export function policyReferenceLabel(target: FindingTarget) {
  return target.code !== target.title
    ? target.title + " · " + target.code
    : target.title;
}

export function PolicyVersionReferenceField({ field, tr, value, onChange }: Props) {
  const directory = useContext(ModuleTrailContext);
  const rows = directory?.coreState === "ready" ? directory.rows : undefined;
  const targets = useMemo(() => findingTargets(rows ?? [], field), [rows, field]);
  const refs = [...new Set(value.split(/[,\n]/).map(ref => ref.trim()).filter(Boolean))];
  const selected = refs.map(ref => ({ ref, target: savedFindingTarget(targets, ref) }));
  const selectedIds = new Set(selected.map(item => item.target?.id));
  const control = field === "controlRef";
  const label = control ? (tr ? "Kontrol ekle" : "Add control") : (tr ? "Risk ekle" : "Add risk");
  const manualLabel = control ? (tr ? "Kontrol referansları" : "Control refs") : (tr ? "Risk referansları" : "Risk refs");

  return <div className="policy-version-links">
    {refs.length < 50 ? <FindingReferencePicker label={label} tr={tr} value=""
      state={directory?.coreState ?? "error"} retry={() => directory?.retryCore()}
      targets={targets.filter(target => !selectedIds.has(target.id))}
      onChange={id => { if (id) onChange([...refs, id].join(", ")); }}/>
      : <p role="status">{tr ? manualLabel + " için en fazla 50 kayıt seçilebilir." : manualLabel + " supports up to 50 entries."}</p>}
    {selected.length > 0 && <ul aria-label={manualLabel}>{selected.map(({ref, target}) => {
      const name = target ? policyReferenceLabel(target) : ref;
      return <li key={ref}><span>{name}</span><button type="button"
        aria-label={(tr ? "Kaldır" : "Remove") + " · " + name}
        onClick={() => onChange(refs.filter(item => item !== ref).join(", "))}>×</button></li>;
    })}</ul>}
    <details><summary>{tr ? "Referansları elle düzenle" : "Edit references manually"}</summary>
      <label>{manualLabel}<input value={value} onChange={e => onChange(e.target.value)}/></label>
    </details>
  </div>;
}
