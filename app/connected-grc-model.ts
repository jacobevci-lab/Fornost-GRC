export type ConnectedGrcRow = {
  id: string;
  code?: string;
  module: string;
  data: Record<string, unknown>;
  updatedAt?: string;
};

export type ConnectedGrcLink = {
  source: ConnectedGrcRow;
  target: ConnectedGrcRow;
  matched: string;
  field: string;
  relation: string;
};

export type UnresolvedGrcReference = {
  source: ConnectedGrcRow;
  field: string;
  value: string;
  relation: string;
};

export type ConnectedGrcCoverageGap = {
  row: ConnectedGrcRow;
  rule:
    | "risk-context"
    | "control-assurance"
    | "evidence-control"
    | "audit-traceability"
    | "finding-traceability"
    | "incident-context"
    | "continuity-bia"
    | "continuity-execution"
    | "policy-mapping"
    | "regulatory-impact"
    | "kri-lineage"
    | "vendor-lineage"
    | "continuous-assurance";
  severity: "high" | "medium";
  expectedRelations: string[];
  missingRelations: string[];
  matchedRelations: string[];
  percent: number;
};

export type ConnectedGrcDomainPosture = {
  module: string;
  eligible: number;
  covered: number;
  partial: number;
  gaps: number;
  percent: number;
};

type RelationDefinition = { relation: string; modules: string[]; sources?: string[] };

const relationFields: Record<string, RelationDefinition> = {
  asset: { relation: "risk-asset", modules: ["Varlık Envanteri"], sources: ["Risk Assessment", "BIA"] },
  processLink: { relation: "risk-process", modules: ["BIA"], sources: ["Risk Assessment", "Kontroller"] },
  biaRef: { relation: "continuity-process", modules: ["BIA"] },
  controlRef: { relation: "control-evidence", modules: ["Kontroller", "Uyum"], sources: ["Kanıtlar", "Uyum", "Denetim Yönetimi"] },
  requirementRef: { relation: "audit-control", modules: ["Kontroller", "Uyum"], sources: ["Denetim Yönetimi"] },
  riskRef: { relation: "audit-risk", modules: ["Risk Assessment"], sources: ["Denetim Yönetimi"] },
  evidenceRef: { relation: "audit-evidence", modules: ["Kanıtlar"], sources: ["Denetim Yönetimi"] },
  vendor: { relation: "asset-vendor", modules: ["Tedarikçiler"], sources: ["Varlık Envanteri"] },
  frameworks: { relation: "control-framework", modules: ["Uyum"], sources: ["Kontroller", "Kanıtlar"] },
  framework: { relation: "control-framework", modules: ["Uyum"], sources: ["Kontroller", "Kanıtlar"] },

  findingRiskRef: { relation: "finding-risk", modules: ["Risk Assessment"], sources: ["Bulgular ve CAPA"] },
  findingControlRef: { relation: "finding-control", modules: ["Kontroller", "Uyum"], sources: ["Bulgular ve CAPA"] },
  findingAuditRef: { relation: "finding-audit", modules: ["Denetim Yönetimi"], sources: ["Bulgular ve CAPA"] },
  findingVendorRef: { relation: "finding-vendor", modules: ["Tedarikçiler"], sources: ["Bulgular ve CAPA"] },
  findingRegulatoryRef: { relation: "finding-regulatory", modules: ["Regülasyon Merkezi"], sources: ["Bulgular ve CAPA"] },
  findingPolicyRef: { relation: "finding-policy", modules: ["Politika Merkezi"], sources: ["Bulgular ve CAPA"] },
  findingIncidentRef: { relation: "finding-incident", modules: ["Güvenlik Olayları"], sources: ["Bulgular ve CAPA"] },

  incidentAssetRefs: { relation: "incident-asset", modules: ["Varlık Envanteri"], sources: ["Güvenlik Olayları"] },
  incidentRiskRef: { relation: "incident-risk", modules: ["Risk Assessment"], sources: ["Güvenlik Olayları"] },
  incidentBiaRef: { relation: "incident-bia", modules: ["BIA"], sources: ["Güvenlik Olayları"] },

  continuityBiaRef: { relation: "continuity-bia", modules: ["BIA"], sources: ["İş Sürekliliği"] },
  continuityPlanRef: { relation: "continuity-plan", modules: ["İş Sürekliliği"], sources: ["İş Sürekliliği"] },

  policyRef: { relation: "policy-version", modules: ["Politika Merkezi"], sources: ["Politika Merkezi"] },
  policyControlRefs: { relation: "policy-control", modules: ["Kontroller", "Uyum"], sources: ["Politika Merkezi"] },
  policyRiskRefs: { relation: "policy-risk", modules: ["Risk Assessment"], sources: ["Politika Merkezi"] },
  policyRegulationRefs: { relation: "policy-regulation", modules: ["Regülasyon Merkezi"], sources: ["Politika Merkezi"] },

  regulatorySourceRef: { relation: "regulatory-source", modules: ["Regülasyon Merkezi"], sources: ["Regülasyon Merkezi"] },
  regulatoryChangeRef: { relation: "regulatory-impact", modules: ["Regülasyon Merkezi"], sources: ["Regülasyon Merkezi"] },
  regulatoryControlRef: { relation: "regulatory-control", modules: ["Kontroller", "Uyum"], sources: ["Regülasyon Merkezi"] },
  regulatoryPolicyRef: { relation: "regulatory-policy", modules: ["Politika Merkezi"], sources: ["Regülasyon Merkezi"] },
  regulatoryRiskRef: { relation: "regulatory-risk", modules: ["Risk Assessment"], sources: ["Regülasyon Merkezi"] },
  regulatoryAssetRef: { relation: "regulatory-asset", modules: ["Varlık Envanteri"], sources: ["Regülasyon Merkezi"] },
  regulatoryVendorRef: { relation: "regulatory-vendor", modules: ["Tedarikçiler"], sources: ["Regülasyon Merkezi"] },
  regulatoryProcessRef: { relation: "regulatory-process", modules: ["BIA"], sources: ["Regülasyon Merkezi"] },
  regulatoryAuditRef: { relation: "regulatory-audit", modules: ["Denetim Yönetimi"], sources: ["Regülasyon Merkezi"] },
  regulatoryEvidenceRef: { relation: "regulatory-evidence", modules: ["Kanıtlar"], sources: ["Regülasyon Merkezi"] },

  appetiteRef: { relation: "kri-appetite", modules: ["Risk İştahı ve KRI"], sources: ["Risk İştahı ve KRI"] },
  measurementRef: { relation: "kri-measurement", modules: ["Risk İştahı ve KRI"], sources: ["Risk İştahı ve KRI"] },

  vendorRef: { relation: "vendor-assessment", modules: ["Tedarikçiler"], sources: ["Tedarikçiler"] },
  vendorAssessmentRef: { relation: "assessment-finding", modules: ["Tedarikçiler"], sources: ["Tedarikçiler"] },

  automationSourceRef: { relation: "automation-source", modules: ["Kanıt Otomasyonu"], sources: ["Kanıt Otomasyonu"] },
  automationControlRefs: { relation: "automation-control", modules: ["Kontroller", "Uyum"], sources: ["Kanıt Otomasyonu"] },
  automationRuleRef: { relation: "automation-rule", modules: ["Kanıt Otomasyonu"], sources: ["Kanıt Otomasyonu"] },
  automationEvidenceRef: { relation: "automation-evidence", modules: ["Kanıtlar"], sources: ["Kanıt Otomasyonu"] },
  automationAssuranceRef: { relation: "control-assurance", modules: ["Kanıt Otomasyonu"], sources: ["Kanıt Otomasyonu"] },
  automationFindingRefs: { relation: "assurance-finding", modules: ["Kanıt Otomasyonu"], sources: ["Kanıt Otomasyonu"] },
  automationRemediationRef: { relation: "finding-remediation", modules: ["Kanıt Otomasyonu"], sources: ["Kanıt Otomasyonu"] },
  automationRiskRef: { relation: "remediation-risk", modules: ["Risk Assessment"], sources: ["Kanıt Otomasyonu"] },
};

const titleFields = [
  "title", "name", "process", "statement", "kriName", "controlId", "controlRef", "controlTitle",
  "evidenceTitle", "auditName", "framework", "code",
];
const aliasFields = [
  ...titleFields, "aliasRefs", "vendorId", "sourceId", "externalRef", "policyId", "appetiteId", "measurementId",
  "planId", "assessmentId", "requirementRef",
];

export const connectedTitle = (row: ConnectedGrcRow) =>
  String(titleFields.map((field) => row.data[field]).find(Boolean) || row.code || row.id);

const normalize = (value: unknown) => String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
const values = (value: unknown): string[] => Array.isArray(value)
  ? value.flatMap(values)
  : String(value ?? "").split(/[;,|\n]+/).map((item) => item.trim()).filter((item) => item.length >= 2);
const aliases = (row: ConnectedGrcRow) => new Set(
  [row.id, row.code, ...aliasFields.map((field) => row.data[field])].flatMap(values).map(normalize).filter(Boolean),
);

export function buildConnectedGrcGraph(rows: ConnectedGrcRow[]) {
  const index = rows.map((row) => ({ row, aliases: aliases(row) }));
  const links: ConnectedGrcLink[] = [], unresolved: UnresolvedGrcReference[] = [], seen = new Set<string>(), unresolvedSeen = new Set<string>();
  for (const source of rows) {
    for (const [field, definition] of Object.entries(relationFields)) {
      if (definition.sources && !definition.sources.includes(source.module)) continue;
      for (const reference of values(source.data[field])) {
        const key = normalize(reference);
        const matches = index.filter((candidate) =>
          candidate.row.id !== source.id && definition.modules.includes(candidate.row.module) && candidate.aliases.has(key),
        );
        if (!matches.length) {
          const unresolvedKey = `${source.id}|${field}|${definition.relation}|${key}`;
          if (!unresolvedSeen.has(unresolvedKey)) {
            unresolvedSeen.add(unresolvedKey);
            unresolved.push({ source, field, value: reference, relation: definition.relation });
          }
          continue;
        }
        for (const { row: target } of matches) {
          const edgeKey = `${source.id}|${target.id}|${definition.relation}|${field}`;
          if (seen.has(edgeKey)) continue;
          seen.add(edgeKey);
          links.push({ source, target, matched: reference, field, relation: definition.relation });
        }
      }
    }
  }
  return { links, unresolved };
}

type CoverageRule = {
  module: string;
  kind?: string;
  rule: ConnectedGrcCoverageGap["rule"];
  severity: ConnectedGrcCoverageGap["severity"];
  relationGroups: string[][];
};

const coverageRules: CoverageRule[] = [
  { module: "Risk Assessment", rule: "risk-context", severity: "high", relationGroups: [["risk-asset", "risk-process"]] },
  { module: "Kontroller", rule: "control-assurance", severity: "high", relationGroups: [["control-evidence"], ["control-framework"]] },
  { module: "Kanıtlar", rule: "evidence-control", severity: "medium", relationGroups: [["control-evidence"]] },
  { module: "Denetim Yönetimi", rule: "audit-traceability", severity: "high", relationGroups: [["audit-control"], ["audit-evidence"]] },
  { module: "Bulgular ve CAPA", kind: "finding", rule: "finding-traceability", severity: "high", relationGroups: [["finding-risk", "finding-control", "finding-audit", "finding-vendor", "finding-regulatory", "finding-policy", "finding-incident"]] },
  { module: "Güvenlik Olayları", kind: "incident", rule: "incident-context", severity: "high", relationGroups: [["incident-asset", "incident-risk", "incident-bia"]] },
  { module: "İş Sürekliliği", kind: "continuity-plan", rule: "continuity-bia", severity: "high", relationGroups: [["continuity-bia"]] },
  { module: "İş Sürekliliği", kind: "continuity-exercise", rule: "continuity-execution", severity: "medium", relationGroups: [["continuity-plan"]] },
  { module: "İş Sürekliliği", kind: "continuity-gap", rule: "continuity-execution", severity: "medium", relationGroups: [["continuity-plan"]] },
  { module: "Politika Merkezi", kind: "policy-version", rule: "policy-mapping", severity: "medium", relationGroups: [["policy-version"], ["policy-control", "policy-risk", "policy-regulation"]] },
  { module: "Regülasyon Merkezi", kind: "regulatory-impact", rule: "regulatory-impact", severity: "high", relationGroups: [["regulatory-impact"], ["regulatory-control", "regulatory-policy", "regulatory-risk", "regulatory-asset", "regulatory-vendor", "regulatory-process", "regulatory-audit", "regulatory-evidence"]] },
  { module: "Risk İştahı ve KRI", kind: "kri-measurement", rule: "kri-lineage", severity: "medium", relationGroups: [["kri-appetite"]] },
  { module: "Risk İştahı ve KRI", kind: "kri-breach", rule: "kri-lineage", severity: "high", relationGroups: [["kri-appetite"], ["kri-measurement"]] },
  { module: "Risk İştahı ve KRI", kind: "risk-scenario", rule: "kri-lineage", severity: "medium", relationGroups: [["kri-appetite"]] },
  { module: "Tedarikçiler", kind: "vendor-assessment", rule: "vendor-lineage", severity: "medium", relationGroups: [["vendor-assessment"]] },
  { module: "Tedarikçiler", kind: "vendor-finding", rule: "vendor-lineage", severity: "high", relationGroups: [["vendor-assessment"], ["assessment-finding"]] },
  { module: "Kanıt Otomasyonu", kind: "automation-rule", rule: "continuous-assurance", severity: "high", relationGroups: [["automation-source"], ["automation-control"], ["control-assurance"]] },
  { module: "Kanıt Otomasyonu", kind: "automation-assurance", rule: "continuous-assurance", severity: "high", relationGroups: [["automation-rule"], ["automation-control"]] },
  { module: "Kanıt Otomasyonu", kind: "automation-finding", rule: "continuous-assurance", severity: "high", relationGroups: [["assurance-finding"], ["finding-remediation"]] },
  { module: "Kanıt Otomasyonu", kind: "automation-remediation", rule: "continuous-assurance", severity: "high", relationGroups: [["finding-remediation"], ["remediation-risk"]] },
];

const ruleForRow = (row: ConnectedGrcRow) => coverageRules.find((rule) =>
  rule.module === row.module && (!rule.kind || String(row.data.kind || "") === rule.kind),
);

export function assessConnectedGrcCoverage(rows: ConnectedGrcRow[], links: ConnectedGrcLink[]) {
  const eligible = rows.filter((row) => Boolean(ruleForRow(row)));
  const gaps: ConnectedGrcCoverageGap[] = [];
  const rowScores = new Map<string, number>();
  for (const row of eligible) {
    const rule = ruleForRow(row)!;
    const rowRelations = new Set(links.filter((link) => link.source === row || link.target === row).map((link) => link.relation));
    const matchedGroups = rule.relationGroups.filter((group) => group.some((relation) => rowRelations.has(relation)));
    const missingGroups = rule.relationGroups.filter((group) => !group.some((relation) => rowRelations.has(relation)));
    const percent = Math.round((matchedGroups.length / rule.relationGroups.length) * 100);
    rowScores.set(row.id, percent);
    if (missingGroups.length) gaps.push({
      row,
      rule: rule.rule,
      severity: rule.severity,
      expectedRelations: rule.relationGroups.flat(),
      missingRelations: missingGroups.map((group) => group[0]),
      matchedRelations: matchedGroups.flatMap((group) => group.filter((relation) => rowRelations.has(relation))),
      percent,
    });
  }
  gaps.sort((a, b) => a.percent - b.percent || Number(b.severity === "high") - Number(a.severity === "high") || a.row.module.localeCompare(b.row.module, "tr"));
  const covered = eligible.length - gaps.length;
  const partial = gaps.filter((gap) => gap.percent > 0).length;
  const percent = eligible.length ? Math.round(Array.from(rowScores.values()).reduce((sum, score) => sum + score, 0) / eligible.length) : 100;
  const domainNames = Array.from(new Set(eligible.map((row) => row.module)));
  const domains: ConnectedGrcDomainPosture[] = domainNames.map((module) => {
    const domainRows = eligible.filter((row) => row.module === module);
    const domainGaps = gaps.filter((gap) => gap.row.module === module);
    const scores = domainRows.map((row) => rowScores.get(row.id) ?? 0);
    return {
      module,
      eligible: domainRows.length,
      covered: domainRows.length - domainGaps.length,
      partial: domainGaps.filter((gap) => gap.percent > 0).length,
      gaps: domainGaps.length,
      percent: domainRows.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / domainRows.length) : 100,
    };
  });
  return { eligible: eligible.length, covered, partial, percent, gaps, domains };
}

export const connectedRemediationModule: Record<string, string> = {
  "risk-asset": "Varlık Envanteri",
  "risk-process": "BIA",
  "control-evidence": "Kanıtlar",
  "control-framework": "Uyum",
  "audit-control": "Kontroller",
  "audit-evidence": "Kanıtlar",
  "finding-risk": "Risk Assessment",
  "finding-control": "Kontroller",
  "finding-audit": "Denetim Yönetimi",
  "finding-vendor": "Tedarikçiler",
  "finding-regulatory": "Regülasyon Merkezi",
  "finding-policy": "Politika Merkezi",
  "finding-incident": "Güvenlik Olayları",
  "incident-asset": "Varlık Envanteri",
  "incident-risk": "Risk Assessment",
  "incident-bia": "BIA",
  "continuity-bia": "BIA",
  "continuity-plan": "İş Sürekliliği",
  "policy-version": "Politika Merkezi",
  "policy-control": "Kontroller",
  "policy-risk": "Risk Assessment",
  "policy-regulation": "Regülasyon Merkezi",
  "regulatory-impact": "Regülasyon Merkezi",
  "regulatory-control": "Kontroller",
  "regulatory-policy": "Politika Merkezi",
  "regulatory-risk": "Risk Assessment",
  "regulatory-asset": "Varlık Envanteri",
  "regulatory-vendor": "Tedarikçiler",
  "regulatory-process": "BIA",
  "regulatory-audit": "Denetim Yönetimi",
  "regulatory-evidence": "Kanıtlar",
  "kri-appetite": "Risk İştahı ve KRI",
  "kri-measurement": "Risk İştahı ve KRI",
  "vendor-assessment": "Tedarikçiler",
  "assessment-finding": "Tedarikçiler",
  "automation-source": "Kanıt Otomasyonu",
  "automation-control": "Kontroller",
  "automation-rule": "Kanıt Otomasyonu",
  "automation-evidence": "Kanıtlar",
  "control-assurance": "Kanıt Otomasyonu",
  "assurance-finding": "Kanıt Otomasyonu",
  "finding-remediation": "Kanıt Otomasyonu",
  "remediation-risk": "Risk Assessment",
};

export const connectedRelationLabels: Record<string, { tr: string; en: string }> = {
  "risk-asset": { tr: "varlığı etkiler", en: "affects asset" },
  "risk-process": { tr: "süreci etkiler", en: "affects process" },
  "continuity-process": { tr: "BIA’ya dayanır", en: "depends on BIA" },
  "control-evidence": { tr: "kontrolü kanıtlar", en: "evidences control" },
  "audit-control": { tr: "kontrolü denetler", en: "audits control" },
  "audit-risk": { tr: "riski doğrular", en: "validates risk" },
  "audit-evidence": { tr: "kanıtı kullanır", en: "uses evidence" },
  "asset-vendor": { tr: "tedarikçiye bağlı", en: "depends on vendor" },
  "control-framework": { tr: "çerçeveyi karşılar", en: "maps to framework" },
  "finding-risk": { tr: "riske bağlı bulgu", en: "finding linked to risk" },
  "finding-control": { tr: "kontrole bağlı bulgu", en: "finding linked to control" },
  "finding-audit": { tr: "denetimden doğar", en: "originates from audit" },
  "finding-vendor": { tr: "tedarikçiden doğar", en: "originates from vendor" },
  "finding-regulatory": { tr: "regülasyondan doğar", en: "originates from regulation" },
  "finding-policy": { tr: "politikaya bağlı", en: "linked to policy" },
  "finding-incident": { tr: "olaya bağlı", en: "linked to incident" },
  "incident-asset": { tr: "varlığı etkiler", en: "impacts asset" },
  "incident-risk": { tr: "riski tetikler", en: "triggers risk" },
  "incident-bia": { tr: "kritik süreci etkiler", en: "impacts critical process" },
  "continuity-bia": { tr: "BIA kapsamını uygular", en: "implements BIA scope" },
  "continuity-plan": { tr: "plana bağlı", en: "linked to plan" },
  "policy-version": { tr: "politika sürümü", en: "policy version" },
  "policy-control": { tr: "kontrolü yönetir", en: "governs control" },
  "policy-risk": { tr: "riski yönetir", en: "governs risk" },
  "policy-regulation": { tr: "regülasyonu karşılar", en: "addresses regulation" },
  "regulatory-source": { tr: "düzenleyici kaynağa bağlı", en: "linked to regulatory source" },
  "regulatory-impact": { tr: "değişiklik etkisi", en: "change impact" },
  "regulatory-control": { tr: "kontrolü etkiler", en: "impacts control" },
  "regulatory-policy": { tr: "politikayı etkiler", en: "impacts policy" },
  "regulatory-risk": { tr: "riski etkiler", en: "impacts risk" },
  "regulatory-asset": { tr: "varlığı etkiler", en: "impacts asset" },
  "regulatory-vendor": { tr: "tedarikçiyi etkiler", en: "impacts vendor" },
  "regulatory-process": { tr: "süreci etkiler", en: "impacts process" },
  "regulatory-audit": { tr: "denetimi etkiler", en: "impacts audit" },
  "regulatory-evidence": { tr: "kanıtı etkiler", en: "impacts evidence" },
  "kri-appetite": { tr: "risk iştahına bağlı", en: "linked to risk appetite" },
  "kri-measurement": { tr: "ölçüme bağlı", en: "linked to measurement" },
  "vendor-assessment": { tr: "tedarikçi değerlendirmesi", en: "vendor assessment" },
  "assessment-finding": { tr: "değerlendirme bulgusu", en: "assessment finding" },
  "automation-source": { tr: "otomasyon kaynağına bağlı", en: "linked to automation source" },
  "automation-control": { tr: "kontrolü sürekli doğrular", en: "continuously validates control" },
  "automation-rule": { tr: "otomasyon kuralından doğar", en: "originates from automation rule" },
  "automation-evidence": { tr: "otomatik kanıta bağlı", en: "linked to automated evidence" },
  "control-assurance": { tr: "kontrol güvencesini üretir", en: "produces control assurance" },
  "assurance-finding": { tr: "güvence düşüşü bulgu üretir", en: "assurance degradation creates finding" },
  "finding-remediation": { tr: "düzeltme aksiyonuna dönüşür", en: "drives remediation action" },
  "remediation-risk": { tr: "artık riske bağlanır", en: "links to residual risk" },
};
