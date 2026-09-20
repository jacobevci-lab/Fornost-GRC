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
  rule: "risk-context" | "control-assurance" | "evidence-control" | "audit-traceability";
  severity: "high" | "medium";
  expectedRelations: string[];
};

const relationFields: Record<string, { relation: string; modules: string[]; sources?: string[] }> = {
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
};

const titleFields = ["title", "name", "process", "controlId", "controlRef", "controlTitle", "evidenceTitle", "auditName", "framework", "code"];

export const connectedTitle = (row: ConnectedGrcRow) =>
  String(titleFields.map((field) => row.data[field]).find(Boolean) || row.code || row.id);

const normalize = (value: unknown) => String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
const values = (value: unknown): string[] => Array.isArray(value)
  ? value.flatMap(values)
  : String(value ?? "").split(/[;,|\n]+/).map((item) => item.trim()).filter((item) => item.length >= 2);
const aliases = (row: ConnectedGrcRow) => new Set([row.id, row.code, ...titleFields.map((field) => row.data[field])].flatMap(values).map(normalize).filter(Boolean));

export function buildConnectedGrcGraph(rows: ConnectedGrcRow[]) {
  const index = rows.map((row) => ({ row, aliases: aliases(row) }));
  const links: ConnectedGrcLink[] = [], unresolved: UnresolvedGrcReference[] = [], seen = new Set<string>();
  for (const source of rows) {
    for (const [field, definition] of Object.entries(relationFields)) {
      if (definition.sources && !definition.sources.includes(source.module)) continue;
      for (const reference of values(source.data[field])) {
        const key = normalize(reference), matches = index.filter((candidate) => candidate.row.id !== source.id && definition.modules.includes(candidate.row.module) && candidate.aliases.has(key));
        if (!matches.length) { unresolved.push({ source, field, value: reference, relation: definition.relation }); continue; }
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

const coverageRules: Array<{
  module: string;
  rule: ConnectedGrcCoverageGap["rule"];
  severity: ConnectedGrcCoverageGap["severity"];
  relations: string[];
}> = [
  { module: "Risk Assessment", rule: "risk-context", severity: "high", relations: ["risk-asset", "risk-process"] },
  { module: "Kontroller", rule: "control-assurance", severity: "high", relations: ["control-evidence", "control-framework", "audit-control"] },
  { module: "Kanıtlar", rule: "evidence-control", severity: "medium", relations: ["control-evidence", "control-framework", "audit-evidence"] },
  { module: "Denetim Yönetimi", rule: "audit-traceability", severity: "high", relations: ["audit-control", "audit-risk", "audit-evidence"] },
];

export function assessConnectedGrcCoverage(rows: ConnectedGrcRow[], links: ConnectedGrcLink[]) {
  const rulesByModule = new Map(coverageRules.map((rule) => [rule.module, rule]));
  const eligible = rows.filter((row) => rulesByModule.has(row.module));
  const gaps: ConnectedGrcCoverageGap[] = [];
  for (const row of eligible) {
    const rule = rulesByModule.get(row.module)!;
    const covered = links.some((link) =>
      (link.source === row || link.target === row) && rule.relations.includes(link.relation),
    );
    if (!covered) gaps.push({ row, rule: rule.rule, severity: rule.severity, expectedRelations: rule.relations });
  }
  gaps.sort((a, b) => Number(b.severity === "high") - Number(a.severity === "high") || a.row.module.localeCompare(b.row.module, "tr"));
  const covered = eligible.length - gaps.length;
  return { eligible: eligible.length, covered, percent: eligible.length ? Math.round((covered / eligible.length) * 100) : 100, gaps };
}

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
};
