import {
  ensureEvidenceHistorySchema,
  publicEvidenceVersion,
  splitEvidenceControlRefs,
  verifyEvidenceVersionChainWithAnchor,
  type EvidenceIntegrityState,
  type EvidenceVersionRow,
} from "./versioning";

export type EvidenceIntegrityOverviewState = EvidenceIntegrityState | "unavailable";
export type EvidenceIntegrityOverviewItem = {
  id: string;
  title: string;
  owner: string;
  period: string;
  controlRefs: string[];
  currentVersion: number;
  updatedAt: string;
  tracked: boolean;
  integrity: EvidenceIntegrityOverviewState;
  checkedVersions: number;
  failedVersion: number;
};
export type EvidenceIntegrityOverviewSummary = {
  evidenceRecords: number;
  trackedEvidence: number;
  legacyEvidence: number;
  totalVersions: number;
  linkedControls: number;
  verifiedChains: number;
  brokenChains: number;
  unavailableChains: number;
  integrityScanComplete: boolean;
};
export type EvidenceIntegrityOverviewResult = {
  evidenceItems: EvidenceIntegrityOverviewItem[];
  recentVersions: ReturnType<typeof publicEvidenceVersion>[];
  summary: EvidenceIntegrityOverviewSummary;
};

type EvidenceRecord = { id: string; data_json: string; updated_at: string };
type EvidenceItemInternal = Omit<EvidenceIntegrityOverviewItem, "integrity" | "checkedVersions" | "failedVersion"> & { headHash: string };
type IntegrityResult = { state: EvidenceIntegrityOverviewState; checked: number; failedVersion: number };

const text = (value: unknown, max = 2000) => String(value ?? "").trim().slice(0, max);
const parse = (raw: string) => {
  try {
    const data = JSON.parse(raw || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

function evidenceItem(record: EvidenceRecord): EvidenceItemInternal {
  const data = parse(record.data_json);
  const currentVersion = Number(data.versionNo || 0);
  return {
    id: record.id,
    title: text(data.evidenceTitle || record.id, 180),
    owner: text(data.owner, 180),
    period: text(data.period, 120),
    controlRefs: splitEvidenceControlRefs(data.controlRefs || data.controlRef),
    currentVersion,
    headHash: text(data.versionChainSha256, 64),
    updatedAt: record.updated_at,
    tracked: currentVersion > 0,
  };
}

export async function readEvidenceIntegrityOverview(
  db: D1Database,
  options: { evidenceLimit?: number; versionLimit?: number; recentLimit?: number } = {},
): Promise<EvidenceIntegrityOverviewResult> {
  await ensureEvidenceHistorySchema(db);
  const evidenceLimit = Math.max(1, Math.min(5000, Number(options.evidenceLimit || 500)));
  const versionLimit = Math.max(1, Math.min(20000, Number(options.versionLimit || 2000)));
  const recentLimit = Math.max(1, Math.min(500, Number(options.recentLimit || 100)));

  const [records, recent, versions, totals, linkedControls] = await Promise.all([
    db.prepare("SELECT id,data_json,updated_at FROM simple_grc_records WHERE module='Kanıtlar' ORDER BY updated_at DESC LIMIT ?").bind(evidenceLimit).all<EvidenceRecord>(),
    db.prepare("SELECT * FROM evidence_versions ORDER BY created_at DESC,version_no DESC LIMIT ?").bind(recentLimit).all<EvidenceVersionRow>(),
    db.prepare("SELECT * FROM evidence_versions ORDER BY evidence_id,version_no LIMIT ?").bind(versionLimit).all<EvidenceVersionRow>(),
    db.prepare("SELECT COUNT(*) total,COUNT(DISTINCT evidence_id) evidence_count FROM evidence_versions").first<{ total: number; evidence_count: number }>(),
    db.prepare("SELECT COUNT(DISTINCT normalized_ref) total FROM evidence_version_controls").first<{ total: number }>(),
  ]);

  const items = records.results.map(evidenceItem);
  const grouped = new Map<string, EvidenceVersionRow[]>();
  for (const row of versions.results) grouped.set(row.evidence_id, [...(grouped.get(row.evidence_id) || []), row]);

  const integrityByEvidenceId = new Map<string, IntegrityResult>();
  for (const item of items) {
    if (!item.tracked) {
      integrityByEvidenceId.set(item.id, { state: "legacy-unverified", checked: 0, failedVersion: 0 });
      continue;
    }
    const rows = grouped.get(item.id) || [];
    if (rows.length !== item.currentVersion) {
      integrityByEvidenceId.set(item.id, { state: "unavailable", checked: rows.length, failedVersion: 0 });
      continue;
    }
    const integrity = await verifyEvidenceVersionChainWithAnchor(rows, {
      versionNo: item.currentVersion,
      chainSha256: item.headHash,
    });
    integrityByEvidenceId.set(item.id, integrity);
  }

  let verifiedChains = 0;
  let brokenChains = 0;
  let unavailableChains = 0;
  const evidenceItems = items.map(({ headHash: _headHash, ...item }) => {
    const integrity = integrityByEvidenceId.get(item.id) || { state: "unavailable" as const, checked: 0, failedVersion: 0 };
    if (integrity.state === "verified") verifiedChains += 1;
    else if (integrity.state === "broken") brokenChains += 1;
    else if (integrity.state === "unavailable") unavailableChains += 1;
    return {
      ...item,
      integrity: integrity.state,
      checkedVersions: integrity.checked,
      failedVersion: integrity.failedVersion,
    };
  });

  const trackedEvidence = Number(totals?.evidence_count || 0);
  return {
    evidenceItems,
    recentVersions: recent.results.map(publicEvidenceVersion),
    summary: {
      evidenceRecords: items.length,
      trackedEvidence,
      legacyEvidence: Math.max(0, items.length - trackedEvidence),
      totalVersions: Number(totals?.total || 0),
      linkedControls: Number(linkedControls?.total || 0),
      verifiedChains,
      brokenChains,
      unavailableChains,
      integrityScanComplete: evidenceItems.filter((item) => item.tracked).every((item) => item.integrity !== "unavailable"),
    },
  };
}
