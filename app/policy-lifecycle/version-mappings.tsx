"use client";

import {useContext, useMemo} from "react";
import {ModuleTrailContext} from "../module-record-trail-view";
import {findingTargets, savedFindingTarget, type FindingTarget} from "../findings/record-references";
import {navigateToFornost} from "../navigation-focus";
import {policyReferenceLabel} from "./version-reference-field";
import type {Version} from "./version-comparison";

export type PolicyMappingTargets = {controls: FindingTarget[]; risks: FindingTarget[]};

export function usePolicyMappingTargets(open: boolean): PolicyMappingTargets {
  const directory = useContext(ModuleTrailContext);
  const rows = open && directory?.coreState === "ready" ? directory.rows : undefined;
  return useMemo(() => ({
    controls: findingTargets(rows ?? [], "controlRef"),
    risks: findingTargets(rows ?? [], "riskRef"),
  }), [rows]);
}

export function PolicyVersionMappings({version, targets, tr}: {
  version: Pick<Version, "controlRefs" | "regulationRefs" | "riskRefs">;
  targets: PolicyMappingTargets;
  tr: boolean;
}) {
  function group(label: string, refs: string[], records?: FindingTarget[]) {
    return <div><dt>{label}</dt><dd>{refs.length ? refs.map(ref => {
      const match = records && savedFindingTarget(records, ref);
      if (!match) return <span key={ref}>{ref}</span>;
      return <button type="button" key={ref} onClick={() => navigateToFornost({module: match.module, kind: "record", ref: match.id})}>
        {policyReferenceLabel(match)}
      </button>;
    }) : "—"}</dd></div>;
  }

  return <dl className="policy-version-mappings">
    {group(tr ? "Kontroller" : "Controls", version.controlRefs, targets.controls)}
    {group(tr ? "Düzenlemeler" : "Regulations", version.regulationRefs)}
    {group(tr ? "Riskler" : "Risks", version.riskRefs, targets.risks)}
  </dl>;
}
