import { ensureAssuranceWorkSchema } from "./continuous-assurance-runtime";
import {
  normalizeEvidenceControlRef,
  splitEvidenceControlRefs,
  verifyEvidenceVersionChainWithAnchor,
  type EvidenceIntegrityState,
  type EvidenceVersionRow,
} from "./evidence/versioning";
import type {
  AssuranceFindingSnapshot,
  AssuranceRuleSnapshot,
  AssuranceWorkSnapshot,
} from "./continuous-assurance-dashboard";

type RuleRow = {
  id: string;
  name: string;
  control_refs: string;
  enabled: number;
  last_status: string | null;
  last_evidence_at: string | null;
  freshness_hours: number;
  consecutive_failures: number;
  next_run_at: string | null;
};
type FindingRow = {
  id: string;
  rule_id: string;
  title: string;
  severity: string;
  owner: string;
  due_date: string;
  status: string;
};
type WorkRow = {
  id: string;
  finding_id: string;
  rule_id: string;
  action: string;
  status: string;
  decision_json: string;
  actor: string;
  reviewed_by: string | null;
  updated_at: string;
};
type EvidenceLinkRow = { evidence_id: string; normalized_ref: string };
type EvidenceRecordRow = { id: string; data_json: string };

const MAX_EVIDENCE_RECORDS = 200;
const MAX_EVIDENCE_VERSION_ROWS = 5_000;
const QUERY_CHUNK_SIZE = 80;

const parse = (value: string | null | undefined) => {
  try { return JSON.parse(value || "{}") as Record<string, unknown>; }
  catch { return {}; }
};
const asObject = (value: unknown) => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};
const chunks = <T,>(values: T[], size = QUERY_CHUNK_SIZE) => {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
};
const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(",");

export function targetControlRefFromDecision(value: string | null | undefined) {
  const decision = parse(value);
  const candidate = asObject(decision.candidate);
  const lineage = asObject(candidate.lineage);
  const payload = asObject(candidate.payload);
  return String(payload.controlRef || lineage.controlRef || decision.targetControlRef || decision.controlRef || "").trim();
}

export function evidenceIntegrityForRule(
  controlRefs: string,
  evidenceIdsByControlRef: ReadonlyMap<string, ReadonlySet<string>>,
  integrityByEvidenceId: ReadonlyMap<string, EvidenceIntegrityState>,
) {
  const evidenceIds = new Set<string>();
  for (const ref of splitEvidenceControlRefs(controlRefs)) {
    const normalized = normalizeEvidenceControlRef(ref);
    for (const evidenceId of evidenceIdsByControlRef.get(normalized) || []) evidenceIds.add(evidenceId);
  }
  if (!evidenceIds.size) return { linkedEvidenceCount: 0 };
  const states = [...evidenceIds].map((id) => integrityByEvidenceId.get(id) || "broken");
  const evidenceIntegrity: EvidenceIntegrityState = states.includes("broken")
    ? "broken"
    : states.includes("legacy-unverified")
      ? "legacy-unverified"
      : "verified";
  return { evidenceIntegrity, linkedEvidenceCount: evidenceIds.size };
}

async function loadRules(db: D1Database): Promise<AssuranceRuleSnapshot[]> {
  try {
    const rows = await db.prepare("SELECT id,name,control_refs,enabled,last_status,last_evidence_at,freshness_hours,consecutive_failures,next_run_at FROM evidence_automation_rules ORDER BY name").all<RuleRow>();
    return rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      controlRefs: row.control_refs || "",
      enabled: !!row.enabled,
      lastStatus: row.last_status,
      lastEvidenceAt: row.last_evidence_at,
      freshnessHours: Number(row.freshness_hours || 24),
      consecutiveFailures: Number(row.consecutive_failures || 0),
      nextRunAt: row.next_run_at,
    }));
  } catch { return []; }
}

async function loadFindings(db: D1Database): Promise<AssuranceFindingSnapshot[]> {
  try {
    const rows = await db.prepare("SELECT id,rule_id,title,severity,owner,due_date,status FROM evidence_automation_findings ORDER BY due_date,updated_at DESC LIMIT 1000").all<FindingRow>();
    return rows.results.map((row) => ({
      id: row.id,
      ruleId: row.rule_id,
      title: row.title,
      severity: row.severity,
      owner: row.owner,
      dueDate: row.due_date,
      status: row.status,
    }));
  } catch { return []; }
}

async function loadWorkItems(db: D1Database): Promise<AssuranceWorkSnapshot[]> {
  try {
    await ensureAssuranceWorkSchema(db);
    const rows = await db.prepare("SELECT id,finding_id,rule_id,action,status,decision_json,actor,reviewed_by,updated_at FROM continuous_assurance_work_items ORDER BY updated_at DESC LIMIT 1000").all<WorkRow>();
    return rows.results.map((row) => ({
      id: row.id,
      findingId: row.finding_id,
      ruleId: row.rule_id,
      action: row.action,
      status: row.status,
      targetControlRef: targetControlRefFromDecision(row.decision_json),
      actor: row.actor,
      reviewedBy: row.reviewed_by || "",
      updatedAt: row.updated_at,
    }));
  } catch { return []; }
}

async function enrichRulesWithEvidenceIntegrity(db: D1Database, rules: AssuranceRuleSnapshot[]) {
  const normalizedRefs = [...new Set(rules.flatMap((rule) => splitEvidenceControlRefs(rule.controlRefs).map(normalizeEvidenceControlRef)).filter(Boolean))];
  const baseQuality = {
    evidenceIntegrityAvailable: true,
    evidenceIntegrityComplete: true,
    evidenceIntegrityLinkedRules: 0,
    evidenceIntegrityVerifiedEvidence: 0,
    evidenceIntegrityBrokenEvidence: 0,
    evidenceIntegrityLegacyEvidence: 0,
  };
  if (!normalizedRefs.length) return { rules, quality: baseQuality };

  try {
    const evidenceIdsByControlRef = new Map<string, Set<string>>();
    for (const group of chunks(normalizedRefs)) {
      const rows = await db.prepare(`SELECT DISTINCT evidence_id,normalized_ref FROM evidence_version_controls WHERE normalized_ref IN (${placeholders(group.length)})`)
        .bind(...group).all<EvidenceLinkRow>();
      for (const row of rows.results) {
        const ids = evidenceIdsByControlRef.get(row.normalized_ref) || new Set<string>();
        ids.add(row.evidence_id);
        evidenceIdsByControlRef.set(row.normalized_ref, ids);
      }
    }

    const evidenceIds = [...new Set([...evidenceIdsByControlRef.values()].flatMap((ids) => [...ids]))];
    const linkedRules = rules.filter((rule) => splitEvidenceControlRefs(rule.controlRefs)
      .some((ref) => (evidenceIdsByControlRef.get(normalizeEvidenceControlRef(ref))?.size || 0) > 0)).length;
    if (!evidenceIds.length) return { rules, quality: { ...baseQuality, evidenceIntegrityLinkedRules: linkedRules } };
    if (evidenceIds.length > MAX_EVIDENCE_RECORDS) {
      return {
        rules,
        quality: { ...baseQuality, evidenceIntegrityComplete: false, evidenceIntegrityLinkedRules: linkedRules },
      };
    }

    let versionCount = 0;
    for (const group of chunks(evidenceIds)) {
      const count = await db.prepare(`SELECT COUNT(*) total FROM evidence_versions WHERE evidence_id IN (${placeholders(group.length)})`)
        .bind(...group).first<{ total: number }>();
      versionCount += Number(count?.total || 0);
    }
    if (versionCount > MAX_EVIDENCE_VERSION_ROWS) {
      return {
        rules,
        quality: { ...baseQuality, evidenceIntegrityComplete: false, evidenceIntegrityLinkedRules: linkedRules },
      };
    }

    const records = new Map<string, Record<string, unknown>>();
    const versions = new Map<string, EvidenceVersionRow[]>();
    for (const group of chunks(evidenceIds)) {
      const [recordRows, versionRows] = await Promise.all([
        db.prepare(`SELECT id,data_json FROM simple_grc_records WHERE module='Kanıtlar' AND id IN (${placeholders(group.length)})`)
          .bind(...group).all<EvidenceRecordRow>(),
        db.prepare(`SELECT * FROM evidence_versions WHERE evidence_id IN (${placeholders(group.length)}) ORDER BY evidence_id,version_no`)
          .bind(...group).all<EvidenceVersionRow>(),
      ]);
      for (const row of recordRows.results) records.set(row.id, parse(row.data_json));
      for (const row of versionRows.results) versions.set(row.evidence_id, [...(versions.get(row.evidence_id) || []), row]);
    }

    const integrityByEvidenceId = new Map<string, EvidenceIntegrityState>();
    for (const evidenceId of evidenceIds) {
      const record = records.get(evidenceId);
      const rows = versions.get(evidenceId) || [];
      if (!record || !rows.length) {
        integrityByEvidenceId.set(evidenceId, "broken");
        continue;
      }
      const result = await verifyEvidenceVersionChainWithAnchor(rows, {
        versionNo: record.versionNo,
        chainSha256: record.versionChainSha256,
      });
      integrityByEvidenceId.set(evidenceId, result.state);
    }

    const enriched = rules.map((rule) => ({
      ...rule,
      ...evidenceIntegrityForRule(rule.controlRefs, evidenceIdsByControlRef, integrityByEvidenceId),
    }));
    const states = [...integrityByEvidenceId.values()];
    return {
      rules: enriched,
      quality: {
        ...baseQuality,
        evidenceIntegrityLinkedRules: linkedRules,
        evidenceIntegrityVerifiedEvidence: states.filter((state) => state === "verified").length,
        evidenceIntegrityBrokenEvidence: states.filter((state) => state === "broken").length,
        evidenceIntegrityLegacyEvidence: states.filter((state) => state === "legacy-unverified").length,
      },
    };
  } catch {
    return {
      rules,
      quality: { ...baseQuality, evidenceIntegrityAvailable: false, evidenceIntegrityComplete: false },
    };
  }
}

export async function loadContinuousAssuranceSnapshots(db: D1Database) {
  const [baseRules, findings, workItems] = await Promise.all([
    loadRules(db),
    loadFindings(db),
    loadWorkItems(db),
  ]);
  const integrity = await enrichRulesWithEvidenceIntegrity(db, baseRules);
  return {
    rules: integrity.rules,
    findings,
    workItems,
    dataQuality: {
      rulesAvailable: baseRules.length > 0,
      findingsAvailable: findings.length > 0,
      workQueueAvailable: workItems.length > 0,
      ...integrity.quality,
    },
  };
}
