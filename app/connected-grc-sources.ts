import type { ConnectedGrcRow } from "./connected-grc-model";

type JsonRecord = Record<string, unknown>;
export type ConnectedGrcEnterprisePayloads = Partial<Record<
  | "findings"
  | "incidents"
  | "continuity"
  | "policy"
  | "riskAppetite"
  | "regulatory"
  | "thirdParty"
  | "evidenceAutomation",
  JsonRecord
>>;

export const connectedGrcEnterpriseEndpoints = [
  { key: "findings", path: "/api/findings" },
  { key: "incidents", path: "/api/incidents" },
  { key: "continuity", path: "/api/continuity" },
  { key: "policy", path: "/api/policy-lifecycle" },
  { key: "riskAppetite", path: "/api/risk-appetite" },
  { key: "regulatory", path: "/api/regulatory-intelligence" },
  { key: "thirdParty", path: "/api/third-party-risk" },
  { key: "evidenceAutomation", path: "/api/evidence-automation" },
] as const;

const record = (value: unknown): JsonRecord | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
const records = (value: unknown) => Array.isArray(value) ? value.map(record).filter((item): item is JsonRecord => Boolean(item)) : [];
const text = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const list = (value: unknown): string[] => Array.isArray(value)
  ? value.flatMap(list)
  : text(value).split(/[;,|\n]+/).map((item) => item.trim()).filter(Boolean);
const unique = (...values: unknown[]) => Array.from(new Set(values.flatMap(list).filter(Boolean)));
const updatedAt = (item: JsonRecord) => text(item.updatedAt || item.updated_at || item.recordedAt || item.detectedAt || item.createdAt || item.created_at) || undefined;
const idOf = (scope: string, kind: string, item: JsonRecord, index: number) => `${scope}:${kind}:${text(item.id || item.code || index)}`;
const makeRow = (scope: string, kind: string, module: string, item: JsonRecord, index: number, data: JsonRecord): ConnectedGrcRow => ({
  id: idOf(scope, kind, item, index),
  code: text(data.publicCode || item.code || item.externalRef || item.external_ref) || undefined,
  module,
  updatedAt: updatedAt(item),
  data: {
    kind,
    ...data,
    aliasRefs: unique(item.id, item.code, item.externalRef, item.external_ref, data.title, data.name, data.identityRefs),
  },
});

function findingsRows(payload: JsonRecord) {
  return records(payload.findings).map((item, index) => {
    const sourceType = text(item.sourceType || item.source_type).toLowerCase();
    const sourceRef = text(item.sourceRef || item.source_ref);
    const riskRefs = unique(item.riskRef, item.risk_ref, sourceType === "risk" ? sourceRef : "");
    const controlRefs = unique(item.controlRef, item.control_ref, sourceType === "control" ? sourceRef : "");
    const traceable = Boolean(sourceRef || riskRefs.length || controlRefs.length);
    const sourceField: Record<string, string> = {
      audit: "findingAuditRef",
      vendor: "findingVendorRef",
      regulatory: "findingRegulatoryRef",
      policy: "findingPolicyRef",
      incident: "findingIncidentRef",
      risk: "findingRiskRef",
      control: "findingControlRef",
    };
    const dynamic = sourceRef && sourceField[sourceType] ? { [sourceField[sourceType]]: sourceRef } : {};
    return makeRow("enterprise", traceable ? "finding" : "finding-manual", "Bulgular ve CAPA", item, index, {
      title: text(item.title),
      sourceType,
      findingRiskRef: riskRefs,
      findingControlRef: controlRefs,
      ...dynamic,
    });
  });
}

function incidentRows(payload: JsonRecord) {
  return records(payload.incidents).map((item, index) => makeRow("enterprise", "incident", "Güvenlik Olayları", item, index, {
    title: text(item.title),
    incidentAssetRefs: unique(item.assetRefs, item.asset_refs),
    incidentRiskRef: unique(item.riskRef, item.risk_ref),
    incidentBiaRef: unique(item.biaRef, item.bia_ref),
  }));
}

function continuityRows(payload: JsonRecord) {
  const plans = records(payload.plans).map((item, index) => makeRow("enterprise", "continuity-plan", "İş Sürekliliği", item, index, {
    title: text(item.name || item.title || item.process),
    name: text(item.name),
    process: text(item.process),
    continuityBiaRef: unique(item.biaRef, item.bia_ref),
  }));
  const exercises = records(payload.exercises).map((item, index) => makeRow("enterprise", "continuity-exercise", "İş Sürekliliği", item, index, {
    title: text(item.name || item.title || `Exercise ${index + 1}`),
    continuityPlanRef: unique(item.planId, item.plan_id),
  }));
  const gaps = records(payload.gaps).map((item, index) => makeRow("enterprise", "continuity-gap", "İş Sürekliliği", item, index, {
    title: text(item.title || item.rootCause || item.root_cause || `Gap ${index + 1}`),
    continuityPlanRef: unique(item.planId, item.plan_id),
  }));
  return [...plans, ...exercises, ...gaps];
}

function policyRows(payload: JsonRecord) {
  const documents = records(payload.documents || payload.policies);
  const documentById = new Map(documents.map((item) => [text(item.id), item]));
  const policies = documents.map((item, index) => makeRow("enterprise", "policy", "Politika Merkezi", item, index, {
    title: text(item.title || item.name),
    name: text(item.title || item.name),
  }));
  const versions = records(payload.versions).map((item, index) => {
    const policyId = text(item.policyId || item.policy_id);
    const parent = documentById.get(policyId);
    const parentTitle = text(parent?.title || parent?.name || policyId);
    const version = text(item.versionNumber || item.version_number);
    return makeRow("enterprise", "policy-version", "Politika Merkezi", item, index, {
      title: `${parentTitle}${version ? ` v${version}` : ""}`.trim(),
      policyRef: unique(policyId),
      policyControlRefs: unique(item.controlRefs, item.control_refs),
      policyRiskRefs: unique(item.riskRefs, item.risk_refs),
      policyRegulationRefs: unique(item.regulationRefs, item.regulation_refs),
    });
  });
  return [...policies, ...versions];
}

function riskAppetiteRows(payload: JsonRecord) {
  const appetites = records(payload.appetites).map((item, index) => makeRow("enterprise", "risk-appetite", "Risk İştahı ve KRI", item, index, {
    title: text(item.statement || item.kriName || item.kri_name || item.category),
    name: text(item.kriName || item.kri_name),
  }));
  const measurements = records(payload.measurements).map((item, index) => makeRow("enterprise", "kri-measurement", "Risk İştahı ve KRI", item, index, {
    title: text(item.periodEnd || item.period_end || `Measurement ${index + 1}`),
    appetiteRef: unique(item.appetiteId, item.appetite_id),
  }));
  const breaches = records(payload.breaches).map((item, index) => makeRow("enterprise", "kri-breach", "Risk İştahı ve KRI", item, index, {
    title: text(item.responsePlan || item.response_plan || item.severity || `Breach ${index + 1}`),
    appetiteRef: unique(item.appetiteId, item.appetite_id),
    measurementRef: unique(item.measurementId, item.measurement_id),
  }));
  const scenarios = records(payload.scenarios).map((item, index) => makeRow("enterprise", "risk-scenario", "Risk İştahı ve KRI", item, index, {
    title: text(item.name || `Scenario ${index + 1}`),
    appetiteRef: unique(item.appetiteId, item.appetite_id),
  }));
  return [...appetites, ...measurements, ...breaches, ...scenarios];
}

function regulatoryRows(payload: JsonRecord) {
  const sources = records(payload.sources).map((item, index) => makeRow("enterprise", "regulatory-source", "Regülasyon Merkezi", item, index, {
    title: text(item.name || item.title),
    name: text(item.name || item.title),
  }));
  const changes = records(payload.changes).map((item, index) => makeRow("enterprise", "regulatory-change", "Regülasyon Merkezi", item, index, {
    title: text(item.title),
    regulatorySourceRef: unique(item.sourceId, item.source_id, item.sourceName, item.source_name),
  }));
  const impacts = records(payload.impacts).map((item, index) => {
    const targetType = text(item.targetType || item.target_type).toLowerCase();
    const targetRef = text(item.targetRef || item.target_ref);
    const targetField: Record<string, string> = {
      control: "regulatoryControlRef",
      policy: "regulatoryPolicyRef",
      risk: "regulatoryRiskRef",
      asset: "regulatoryAssetRef",
      vendor: "regulatoryVendorRef",
      process: "regulatoryProcessRef",
      audit: "regulatoryAuditRef",
      evidence: "regulatoryEvidenceRef",
    };
    return makeRow("enterprise", "regulatory-impact", "Regülasyon Merkezi", item, index, {
      title: text(item.targetTitle || item.target_title || targetRef || `Impact ${index + 1}`),
      targetType,
      regulatoryChangeRef: unique(item.changeId, item.change_id),
      ...(targetRef && targetField[targetType] ? { [targetField[targetType]]: targetRef } : {}),
    });
  });
  return [...sources, ...changes, ...impacts];
}

function thirdPartyRows(payload: JsonRecord) {
  const vendors = records(payload.vendors).map((item, index) => {
    const vendorId = text(item.vendorId || item.vendor_id || item.id);
    return makeRow("enterprise", "vendor", "Tedarikçiler", item, index, {
      title: text(item.name || item.service),
      name: text(item.name),
      vendorId,
      identityRefs: unique(vendorId),
      publicCode: vendorId,
    });
  });
  const assessments = records(payload.assessments).map((item, index) => makeRow("enterprise", "vendor-assessment", "Tedarikçiler", item, index, {
    title: text(item.title || `Assessment ${item.cycleNumber || item.cycle_number || index + 1}`),
    vendorRef: unique(item.vendorId, item.vendor_id),
  }));
  const findings = records(payload.findings).map((item, index) => makeRow("enterprise", "vendor-finding", "Tedarikçiler", item, index, {
    title: text(item.title || `Vendor finding ${index + 1}`),
    vendorRef: unique(item.vendorId, item.vendor_id),
    vendorAssessmentRef: unique(item.assessmentId, item.assessment_id),
  }));
  return [...vendors, ...assessments, ...findings];
}

function evidenceAutomationRows(payload: JsonRecord) {
  const sources = records(payload.sources).map((item, index) => makeRow("enterprise", "automation-source", "Kanıt Otomasyonu", item, index, {
    title: text(item.name || item.vendor || `Automation source ${index + 1}`),
    name: text(item.name),
    identityRefs: unique(item.id),
    automationHealth: text(item.lastTestStatus || item.last_test_status),
  }));
  const rules = records(payload.rules).map((item, index) => makeRow("enterprise", "automation-rule", "Kanıt Otomasyonu", item, index, {
    title: text(item.name || `Continuous control ${index + 1}`),
    name: text(item.name),
    identityRefs: unique(item.id),
    automationSourceRef: unique(item.sourceId, item.source_id),
    automationControlRefs: unique(item.controlRefs, item.control_refs),
    automationHealth: text(item.health || item.lastStatus || item.last_status),
    automationFreshness: text(item.freshness),
  }));
  const findings = records(payload.findings).map((item, index) => makeRow("enterprise", "automation-finding", "Kanıt Otomasyonu", item, index, {
    title: text(item.title || `Continuous assurance finding ${index + 1}`),
    automationRuleRef: unique(item.ruleId, item.rule_id),
    automationEvidenceRef: unique(item.evidenceId, item.evidence_id),
    severity: text(item.severity),
    status: text(item.status),
  }));
  return [...sources, ...rules, ...findings];
}

export function buildConnectedGrcEnterpriseRows(payloads: ConnectedGrcEnterprisePayloads): ConnectedGrcRow[] {
  const rows = [
    ...findingsRows(payloads.findings || {}),
    ...incidentRows(payloads.incidents || {}),
    ...continuityRows(payloads.continuity || {}),
    ...policyRows(payloads.policy || {}),
    ...riskAppetiteRows(payloads.riskAppetite || {}),
    ...regulatoryRows(payloads.regulatory || {}),
    ...thirdPartyRows(payloads.thirdParty || {}),
    ...evidenceAutomationRows(payloads.evidenceAutomation || {}),
  ];
  const deduped = new Map<string, ConnectedGrcRow>();
  for (const row of rows) deduped.set(row.id, row);
  return Array.from(deduped.values()).sort((a, b) => a.module.localeCompare(b.module, "tr") || a.id.localeCompare(b.id));
}
