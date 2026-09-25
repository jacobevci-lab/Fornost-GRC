import { sanitizeAiRecord } from "./security";
import { retrieveApprovedKnowledge } from "./knowledge";
import { dataClassificationAllowed, type AiDataClassification } from "./data-policy";
import { buildOperationalAssuranceAiContext } from "./operational-assurance-context";
import { buildEvidenceLineageAiContext } from "./evidence-lineage-context";

export type AiContextFilterKey = "recordRef" | "riskRef" | "controlRef" | "evidenceRef" | "findingRef" | "ruleRef" | "sourceRef";
export type AiContextNavigation = { module: string; ref: string; filterKey: AiContextFilterKey };
export type AiContextSource = { id: string; module: string; title: string; navigation?: AiContextNavigation };
type GrcRow = { id: string; module: string; data_json: string; updated_at: string };

const MODULE_HINTS: Array<{ module: string; terms: string[] }> = [
  { module: "Risk Assessment", terms: ["risk", "riskler", "riskleri", "tehdit", "threat"] },
  { module: "Varlık Envanteri", terms: ["varlik", "varlık", "asset", "envanter", "kritik sistem"] },
  { module: "BIA", terms: ["bia", "rto", "rpo", "is etki", "iş etki", "business impact", "kritik surec", "kritik süreç"] },
  { module: "Uyum", terms: ["uyum", "compliance", "iso", "soc", "pci", "nist", "dora", "kvkk", "gdpr"] },
  { module: "Kontroller", terms: ["kontrol", "control", "control gap", "kontrol acigi", "kontrol açığı"] },
  { module: "Kanıtlar", terms: [
    "kanit", "kanıt", "evidence", "dokuman", "doküman", "kanıt geçmişi", "kanit gecmisi", "evidence history",
    "kanıt versiyonu", "kanit versiyonu", "evidence version", "evidence lineage", "kanıt zinciri", "kanit zinciri",
    "bütünlük zinciri", "butunluk zinciri", "integrity chain", "evidence timeline", "sha-256", "sha256",
  ] },
  { module: "Kanıt Otomasyonu", terms: [
    "sürekli güvence", "surekli guvence", "continuous assurance", "kanıt otomasyonu", "kanit otomasyonu", "evidence automation",
    "evidence freshness", "kanıt tazeliği", "kanit tazeligi", "failed retest", "retest", "yeniden test",
    "assurance exception", "exception", "waiver", "istisna", "risk review", "residual risk review", "residual risk",
    "escalation", "eskalasyon", "mandatory retest", "zorunlu re-test", "zorunlu retest",
  ] },
  { module: "Bulgular ve CAPA", terms: ["capa", "remediation", "düzeltme", "duzeltme", "düzeltici aksiyon", "duzeltici aksiyon", "corrective action", "bulgu", "finding"] },
  { module: "Denetim Yönetimi", terms: ["denetim", "audit", "auditor"] },
  { module: "Tedarikçiler", terms: ["tedarik", "vendor", "supplier", "ucuncu taraf", "üçüncü taraf"] },
];

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const ref = (value: unknown) => String(value ?? "").normalize("NFKC").trim();

export function inferReadModules(question: string) {
  const normalized = normalize(question);
  const matched = MODULE_HINTS.filter((hint) => hint.terms.some((term) => normalized.includes(normalize(term)))).map((hint) => hint.module);
  return [...new Set(matched)];
}

function titleOf(moduleName: string, data: Record<string, unknown>, id: string) {
  const candidates = [
    data.title,
    data.process,
    data.auditName && data.requirementRef ? `${data.auditName} · ${data.requirementRef}` : data.auditName,
    data.evidenceTitle,
    data.controlTitle,
    data.framework,
    data.service,
  ];
  return String(candidates.find((value) => typeof value === "string" && value.trim()) || `${moduleName} · ${id}`).slice(0, 180);
}

function parseData(row: GrcRow) {
  try {
    const parsed = JSON.parse(row.data_json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function aiRecordNavigation(row: Pick<GrcRow, "id" | "module">, data: Record<string, unknown>): AiContextNavigation | undefined {
  if (row.module === "Risk Assessment") {
    const value = ref(data.riskId || data.code || row.id);
    return value ? { module: "Risk Assessment", ref: value, filterKey: "riskRef" } : undefined;
  }
  if (row.module === "Kontroller") {
    const value = ref(data.controlId || data.controlCode || data.code || data.reference || row.id);
    return value ? { module: "Kontroller", ref: value, filterKey: "controlRef" } : undefined;
  }
  if (row.module === "Kanıtlar") {
    const value = ref(data.evidenceId || data.code || row.id);
    return value ? { module: "Kanıtlar", ref: value, filterKey: "evidenceRef" } : undefined;
  }
  if (row.module === "Bulgular ve CAPA") {
    const value = ref(data.findingCode || data.code || data.findingId || "");
    return value ? { module: "Bulgular ve CAPA", ref: value, filterKey: "findingRef" } : undefined;
  }
  return undefined;
}

function scoreRow(row: GrcRow, data: Record<string, unknown>, question: string, targetModules: string[]) {
  const terms = normalize(question).split(/[^a-z0-9çğıöşü]+/i).filter((term) => term.length >= 3).slice(0, 20);
  const haystack = normalize(`${row.id} ${row.module} ${JSON.stringify(data)}`).slice(0, 20_000);
  let score = targetModules.includes(row.module) ? 20 : 0;
  for (const term of terms) if (haystack.includes(term)) score += term.length >= 6 ? 3 : 1;
  return score;
}

function recordClassification(data:Record<string,unknown>){return data.dataClassification??data.classification??data.securityClassification??"Internal";}

export async function buildGrcContext(db: D1Database, question: string, maxDataClassification: AiDataClassification = "Confidential") {
  const targetModules = inferReadModules(question);
  const includeOperationalAssurance = targetModules.includes("Kanıt Otomasyonu") || targetModules.includes("Bulgular ve CAPA");
  const includeEvidenceLineage = targetModules.includes("Kanıtlar");
  const specialContextBudget = includeOperationalAssurance && includeEvidenceLineage ? 5_000 : 6_500;
  const [knowledge, result, operationalAssurance, evidenceLineage] = await Promise.all([
    retrieveApprovedKnowledge(db, question, 9_000, maxDataClassification),
    db.prepare("SELECT id,module,data_json,updated_at FROM simple_grc_records ORDER BY updated_at DESC LIMIT 400").all<GrcRow>(),
    includeOperationalAssurance
      ? buildOperationalAssuranceAiContext(db, maxDataClassification, specialContextBudget)
      : Promise.resolve({ sources: [], contextText: "", summaryAvailable: false }),
    includeEvidenceLineage
      ? buildEvidenceLineageAiContext(db, question, maxDataClassification, specialContextBudget)
      : Promise.resolve({ sources: [], contextText: "", summaryAvailable: false, integrityComplete: false }),
  ]);
  const rows = result.results || [];
  const parsed = rows.map((row) => ({ row, data: parseData(row) })).filter(({data})=>dataClassificationAllowed(recordClassification(data),maxDataClassification));
  const relevant = (targetModules.length ? parsed.filter(({ row }) => targetModules.includes(row.module)) : parsed)
    .map((item) => ({ ...item, score: scoreRow(item.row, item.data, question, targetModules) }))
    .sort((a, b) => b.score - a.score || b.row.updated_at.localeCompare(a.row.updated_at));

  const selected: typeof relevant = [];
  if (targetModules.length) {
    for (const moduleName of targetModules) selected.push(...relevant.filter(({ row }) => row.module === moduleName).slice(0, 12));
  } else {
    const moduleNames = [...new Set(relevant.map(({ row }) => row.module))];
    for (const moduleName of moduleNames) selected.push(...relevant.filter(({ row }) => row.module === moduleName).slice(0, 4));
  }

  const unique = [...new Map(selected.map((item) => [item.row.id, item])).values()].slice(0, 48);
  const sources: AiContextSource[] = [];
  const chunks: string[] = [];
  let total = 0;
  const specialContexts = [operationalAssurance.contextText, evidenceLineage.contextText].filter(Boolean).length;
  const recordBudget = specialContexts >= 2 ? 7_000 : specialContexts === 1 ? 10_500 : 16_000;
  for (const { row, data } of unique) {
    const sanitized = sanitizeAiRecord(data) as Record<string, unknown>;
    const title = titleOf(row.module, sanitized, row.id);
    const chunk = JSON.stringify({ sourceId: row.id, module: row.module, title, updatedAt: row.updated_at, data: sanitized });
    if (total + chunk.length > recordBudget) break;
    total += chunk.length;
    chunks.push(chunk);
    const navigation = aiRecordNavigation(row, sanitized);
    sources.push({ id: row.id, module: row.module, title, ...(navigation ? { navigation } : {}) });
  }

  const combinedSources: AiContextSource[] = [...operationalAssurance.sources, ...evidenceLineage.sources, ...sources, ...knowledge.sources];
  const combinedChunks = [
    ...(operationalAssurance.contextText ? [operationalAssurance.contextText] : []),
    ...(evidenceLineage.contextText ? [evidenceLineage.contextText] : []),
    ...chunks,
    ...(knowledge.contextText ? [knowledge.contextText] : []),
  ];
  return {
    sources: combinedSources,
    contextText: combinedChunks.length ? combinedChunks.join("\n") : "No matching approved Fornost GRC or knowledge-base records were available for this question.",
    inferredModules: targetModules,
    maxDataClassification,
  };
}
