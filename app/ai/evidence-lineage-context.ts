import {
  publicEvidenceVersion,
  splitEvidenceControlRefs,
  verifyEvidenceVersionChain,
  type EvidenceVersionRow,
} from "../evidence/versioning";
import { dataClassificationAllowed, type AiDataClassification } from "./data-policy";
import { sanitizeAiRecord } from "./security";

export type EvidenceLineageContextSource = { id: string; module: string; title: string; navigation?: {module:"Kanıtlar";ref:string;filterKey:"evidenceRef"} };
type EvidenceRecordRow = { id: string; data_json: string; created_at: string; updated_at: string };
type EvidenceRecord = {
  id: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  classification: unknown;
};
type IntegrityState = "verified" | "broken" | "legacy-unverified" | "history-unavailable";
type IntegrityResult = { state: IntegrityState; checked: number; failedVersion: number };

const RECORD_SCAN_LIMIT = 1_000;
const GLOBAL_VERSION_LIMIT = 5_000;
const BIND_CHUNK_SIZE = 75;
const DETAIL_LIMIT = 8;

const compact = (value: unknown, max = 220) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const normalize = (value: unknown) => String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const classificationOf = (data: Record<string, unknown>) => data.dataClassification ?? data.classification ?? data.securityClassification ?? "Internal";

function parseRecord(row: EvidenceRecordRow): EvidenceRecord {
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.data_json || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    data = {};
  }
  return { id: row.id, data, createdAt: row.created_at, updatedAt: row.updated_at, classification: classificationOf(data) };
}

function chunks<T>(items: T[], size = BIND_CHUNK_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export function isGlobalEvidenceIntegrityQuestion(question: string) {
  const value = normalize(question);
  const integrityTerms = ["integrity", "butunluk", "chain", "zincir", "tamper", "kurcalan", "sha-256", "sha256"];
  if (!integrityTerms.some((term) => value.includes(term))) return false;
  if (/evd-[a-z0-9-]+/i.test(question)) return false;
  const controlSpecific = /\b(?:cc\d+(?:\.\d+)*|a\.\d+(?:\.\d+)*|pci[-.\s]?\d+(?:\.\d+)*|nist[-.\s]?[a-z0-9.:-]+)\b/i.test(question);
  return !controlSpecific;
}

export function scoreEvidenceLineageRecord(record: Pick<EvidenceRecord, "id" | "data" | "updatedAt">, question: string) {
  const q = normalize(question);
  const id = normalize(record.id);
  if (id && q.includes(id)) return 1_000;
  const refs = splitEvidenceControlRefs(record.data.controlRefs ?? record.data.controlRef);
  let score = 0;
  for (const ref of refs) if (q.includes(normalize(ref))) score += 120;
  const terms = q.split(/[^a-z0-9çğıöşü.-]+/i)
    .filter((term) => term.length >= 3)
    .filter((term) => !["evidence", "kanit", "history", "gecmis", "version", "versiyon", "integrity", "butunluk", "chain", "zincir"].includes(term))
    .slice(0, 24);
  const haystack = normalize(`${record.id} ${Object.values(record.data).filter((value) => typeof value === "string").join(" ")}`).slice(0, 18_000);
  for (const term of terms) if (haystack.includes(term)) score += term.length >= 6 ? 5 : 2;
  return score;
}

export function selectEvidenceLineageCandidates(records: EvidenceRecord[], question: string, limit = DETAIL_LIMIT) {
  const exactIds = new Set((question.match(/evd-[a-z0-9-]+/gi) || []).map(normalize));
  const scored = records
    .filter((record) => !exactIds.size || exactIds.has(normalize(record.id)))
    .map((record) => ({ record, score: scoreEvidenceLineageRecord(record, question) }))
    .sort((a, b) => b.score - a.score || b.record.updatedAt.localeCompare(a.record.updatedAt));
  return scored.slice(0, limit).map(({ record }) => record);
}

async function queryVersionsForIds(db: D1Database, ids: string[]) {
  const rows: EvidenceVersionRow[] = [];
  for (const group of chunks(ids)) {
    if (!group.length) continue;
    const placeholders = group.map(() => "?").join(",");
    const result = await db.prepare(`SELECT * FROM evidence_versions WHERE evidence_id IN (${placeholders}) ORDER BY evidence_id,version_no`)
      .bind(...group).all<EvidenceVersionRow>();
    rows.push(...(result.results || []));
  }
  return rows;
}

async function countVersionsForIds(db: D1Database, ids: string[]) {
  let total = 0;
  for (const group of chunks(ids)) {
    if (!group.length) continue;
    const placeholders = group.map(() => "?").join(",");
    const result = await db.prepare(`SELECT evidence_id,COUNT(*) total FROM evidence_versions WHERE evidence_id IN (${placeholders}) GROUP BY evidence_id`)
      .bind(...group).all<{ evidence_id: string; total: number }>();
    for (const row of result.results || []) total += Number(row.total || 0);
  }
  return total;
}

function groupVersions(rows: EvidenceVersionRow[]) {
  const grouped = new Map<string, EvidenceVersionRow[]>();
  for (const row of rows) grouped.set(row.evidence_id, [...(grouped.get(row.evidence_id) || []), row]);
  return grouped;
}

async function integrityFor(record: EvidenceRecord, rows: EvidenceVersionRow[]): Promise<IntegrityResult> {
  if (!rows.length) {
    const expectedTracked = Number(record.data.versionNo || 0) > 0;
    return expectedTracked
      ? { state: "history-unavailable", checked: 0, failedVersion: 0 }
      : { state: "legacy-unverified", checked: 0, failedVersion: 0 };
  }
  const verified = await verifyEvidenceVersionChain(rows);
  return { state: verified.state, checked: verified.checked, failedVersion: verified.failedVersion };
}

function titleOf(record: EvidenceRecord) {
  return compact(record.data.evidenceTitle || record.id, 180) || record.id;
}

function compactVersion(row: EvidenceVersionRow) {
  const version = publicEvidenceVersion(row);
  return {
    versionNo: version.versionNo,
    fileName: compact(version.fileName, 180),
    fileType: compact(version.fileType, 100),
    fileSize: version.fileSize,
    contentSha256: version.contentSha256,
    chainSha256: version.chainSha256,
    previousVersionId: version.previousVersionId,
    controlRefs: version.controlRefs,
    changeNote: compact(version.changeNote, 500),
    createdBy: compact(version.createdBy, 180),
    createdAt: version.createdAt,
  };
}

export async function buildEvidenceLineageAiContext(
  db: D1Database,
  question: string,
  maxDataClassification: AiDataClassification,
  maxChars = 6_500,
) {
  let rawRecords: EvidenceRecordRow[] = [];
  try {
    const result = await db.prepare("SELECT id,data_json,created_at,updated_at FROM simple_grc_records WHERE module='Kanıtlar' ORDER BY updated_at DESC LIMIT ?")
      .bind(RECORD_SCAN_LIMIT).all<EvidenceRecordRow>();
    rawRecords = result.results || [];
  } catch {
    return { sources: [] as EvidenceLineageContextSource[], contextText: "", summaryAvailable: false };
  }

  const records = rawRecords.map(parseRecord).filter((record) => dataClassificationAllowed(record.classification, maxDataClassification));
  if (!records.length) return { sources: [] as EvidenceLineageContextSource[], contextText: "", summaryAvailable: false };

  const candidates = selectEvidenceLineageCandidates(records, question);
  const visibleIds = records.map((record) => record.id);
  const wantsGlobalIntegrity = isGlobalEvidenceIntegrityQuestion(question);
  const recordScanComplete = rawRecords.length < RECORD_SCAN_LIMIT;
  let versionSchemaAvailable = true;
  let globalComplete = false;
  let loadedRows: EvidenceVersionRow[] = [];

  try {
    if (wantsGlobalIntegrity && recordScanComplete) {
      const visibleVersionCount = await countVersionsForIds(db, visibleIds);
      if (visibleVersionCount <= GLOBAL_VERSION_LIMIT) {
        loadedRows = await queryVersionsForIds(db, visibleIds);
        globalComplete = true;
      }
    }
    if (!globalComplete && candidates.length) loadedRows = await queryVersionsForIds(db, candidates.map((record) => record.id));
  } catch {
    versionSchemaAvailable = false;
    loadedRows = [];
  }

  const grouped = groupVersions(loadedRows);
  const globalIntegrity = new Map<string, IntegrityResult>();
  if (globalComplete) {
    for (const record of records) globalIntegrity.set(record.id, await integrityFor(record, grouped.get(record.id) || []));
  }

  let detailRecords = candidates;
  if (globalComplete) {
    const broken = records.filter((record) => globalIntegrity.get(record.id)?.state === "broken");
    const ordered = [...broken, ...candidates];
    detailRecords = [...new Map(ordered.map((record) => [record.id, record])).values()].slice(0, DETAIL_LIMIT);
  }

  if (!globalComplete && versionSchemaAvailable) {
    const missingIds = detailRecords.map((record) => record.id).filter((id) => !grouped.has(id));
    if (missingIds.length) {
      try {
        const missingRows = await queryVersionsForIds(db, missingIds);
        loadedRows.push(...missingRows);
        for (const [id, rows] of groupVersions(missingRows)) grouped.set(id, rows);
      } catch {
        versionSchemaAvailable = false;
      }
    }
  }

  const detailIntegrity = new Map<string, IntegrityResult>();
  for (const record of detailRecords) detailIntegrity.set(record.id, globalIntegrity.get(record.id) || await integrityFor(record, grouped.get(record.id) || []));

  const integrityValues = globalComplete ? [...globalIntegrity.values()] : [...detailIntegrity.values()];
  const summary = {
    kind: "fornost_evidence_lineage_summary",
    visibleEvidenceRecords: records.length,
    trackedEvidence: records.filter((record) => Number(record.data.versionNo || 0) > 0).length,
    legacyEvidence: records.filter((record) => Number(record.data.versionNo || 0) <= 0).length,
    versionHistoryAvailable: versionSchemaAvailable,
    integrityVerification: {
      scope: globalComplete ? "all-visible-evidence" : "selected-evidence",
      complete: globalComplete,
      checkedEvidence: integrityValues.length,
      verifiedChains: integrityValues.filter((item) => item.state === "verified").length,
      brokenChains: integrityValues.filter((item) => item.state === "broken").length,
      legacyUnverified: integrityValues.filter((item) => item.state === "legacy-unverified").length,
      historyUnavailable: integrityValues.filter((item) => item.state === "history-unavailable").length,
      recordScanComplete,
    },
  };

  const sources: EvidenceLineageContextSource[] = [];
  const chunksOut: string[] = [];
  let used = 0;
  const add = (source: EvidenceLineageContextSource, data: Record<string, unknown>) => {
    const chunk = JSON.stringify({sourceId:source.id,module:source.module,title:source.title,dataClassification:"Policy-filtered from evidence record",data:sanitizeAiRecord(data)});
    if (used + chunk.length > maxChars) return false;
    used += chunk.length;
    sources.push(source);
    chunksOut.push(chunk);
    return true;
  };

  add({ id: "EVIDENCE-LINEAGE-SUMMARY", module: "Kanıtlar", title: "Evidence lineage and integrity summary" }, summary);
  const exactEvidenceQuestion = /evd-[a-z0-9-]+/i.test(question);
  for (const record of detailRecords) {
    const rows = grouped.get(record.id) || [];
    const integrity = detailIntegrity.get(record.id) || await integrityFor(record, rows);
    const newestFirst = [...rows].sort((a, b) => b.version_no - a.version_no);
    const detailVersionLimit = exactEvidenceQuestion ? 12 : 6;
    let versions = newestFirst.slice(0, detailVersionLimit).map(compactVersion);
    const base = {
      kind: "fornost_evidence_lineage",
      evidenceId: record.id,
      evidenceTitle: titleOf(record),
      owner: compact(record.data.owner, 180),
      period: compact(record.data.period, 120),
      status: compact(record.data.status, 100),
      frameworks: compact(record.data.frameworks, 900),
      controlRefs: splitEvidenceControlRefs(record.data.controlRefs ?? record.data.controlRef),
      currentVersion: Number(record.data.versionNo || (rows.length ? Math.max(...rows.map((row) => row.version_no)) : 0)),
      updatedAt: record.updatedAt,
      integrity,
      versionsTotal: rows.length,
      versionsIncluded: versions.length,
    };
    const source:EvidenceLineageContextSource={id:record.id,module:"Kanıtlar",title:titleOf(record),navigation:{module:"Kanıtlar",ref:record.id,filterKey:"evidenceRef"}};
    let added = false;
    while (!added) {
      added = add(source, { ...base, versionsIncluded: versions.length, versions });
      if (added || !versions.length) break;
      versions = versions.slice(0, -1);
    }
    if (!added) break;
  }

  return {sources,contextText:chunksOut.join("\n"),summaryAvailable:chunksOut.length>0,integrityComplete:globalComplete};
}
