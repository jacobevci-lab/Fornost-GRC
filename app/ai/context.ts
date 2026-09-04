import { sanitizeAiRecord } from "./security";

export type AiContextSource = { id: string; module: string; title: string };
type GrcRow = { id: string; module: string; data_json: string; updated_at: string };

const MODULE_HINTS: Array<{ module: string; terms: string[] }> = [
  { module: "Risk Assessment", terms: ["risk", "riskler", "riskleri", "tehdit", "threat"] },
  { module: "Varlık Envanteri", terms: ["varlik", "varlık", "asset", "envanter", "kritik sistem"] },
  { module: "BIA", terms: ["bia", "rto", "rpo", "is etki", "iş etki", "business impact", "kritik surec", "kritik süreç"] },
  { module: "Uyum", terms: ["uyum", "compliance", "iso", "soc", "pci", "nist", "dora", "kvkk", "gdpr"] },
  { module: "Kontroller", terms: ["kontrol", "control", "control gap", "kontrol acigi", "kontrol açığı"] },
  { module: "Kanıtlar", terms: ["kanit", "kanıt", "evidence", "dokuman", "doküman"] },
  { module: "Denetim Yönetimi", terms: ["denetim", "audit", "bulgu", "finding", "auditor"] },
  { module: "Tedarikçiler", terms: ["tedarik", "vendor", "supplier", "ucuncu taraf", "üçüncü taraf"] },
];

function normalize(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

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

function scoreRow(row: GrcRow, data: Record<string, unknown>, question: string, targetModules: string[]) {
  const terms = normalize(question).split(/[^a-z0-9çğıöşü]+/i).filter((term) => term.length >= 3).slice(0, 20);
  const haystack = normalize(`${row.id} ${row.module} ${JSON.stringify(data)}`).slice(0, 20_000);
  let score = targetModules.includes(row.module) ? 20 : 0;
  for (const term of terms) if (haystack.includes(term)) score += term.length >= 6 ? 3 : 1;
  return score;
}

export async function buildGrcContext(db: D1Database, question: string) {
  const result = await db.prepare("SELECT id,module,data_json,updated_at FROM simple_grc_records ORDER BY updated_at DESC LIMIT 400").all<GrcRow>();
  const rows = result.results || [];
  const targetModules = inferReadModules(question);
  const parsed = rows.map((row) => ({ row, data: parseData(row) }));
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
  for (const { row, data } of unique) {
    const sanitized = sanitizeAiRecord(data) as Record<string, unknown>;
    const title = titleOf(row.module, sanitized, row.id);
    const chunk = JSON.stringify({ sourceId: row.id, module: row.module, title, updatedAt: row.updated_at, data: sanitized });
    if (total + chunk.length > 22_000) break;
    total += chunk.length;
    chunks.push(chunk);
    sources.push({ id: row.id, module: row.module, title });
  }

  return {
    sources,
    contextText: chunks.length ? chunks.join("\n") : "No matching Fornost GRC records were available for this question.",
    inferredModules: targetModules,
  };
}
