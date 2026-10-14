import { publicEvidenceVersion, splitEvidenceControlRefs, verifyEvidenceVersionChainWithAnchor, type EvidenceVersionRow } from './versioning';

export type HistoryRecord = { id: string; data_json: string; created_at: string; updated_at: string; version_count: number };
type HistoryVersion = EvidenceVersionRow & { record_available: number };
const recordData = (raw: string): Record<string, unknown> => {
  try { const value = JSON.parse(raw); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
};
const selectedRecords = "SELECT id FROM simple_grc_records WHERE module='Kanıtlar' ORDER BY updated_at DESC,id LIMIT 500";
const versionCounts = 'SELECT evidence_id,COUNT(*) version_count FROM evidence_versions GROUP BY evidence_id';
const jsonData = "CASE WHEN json_valid(r.data_json) THEN r.data_json ELSE '{}' END";
const tracked = `(COALESCE(v.version_count,0)>0 OR TRIM(COALESCE(CAST(json_extract(${jsonData},'$.versionNo') AS TEXT),'')) NOT IN ('','0') OR TRIM(COALESCE(CAST(json_extract(${jsonData},'$.versionChainSha256') AS TEXT),''))<>'')`;
const hasAnchor = (data: Record<string, unknown>) => !['', '0'].includes(String(data.versionNo ?? '').trim()) || Boolean(String(data.versionChainSha256 ?? '').trim());


/** A bounded read is unavailable, never a claim that missing rows are corrupt or verified. */
export async function historyIntegrity(rows: EvidenceVersionRow[], total: number, data: Record<string, unknown>) {
  if (rows.length < total) return { state: 'unavailable' as const, checked: 0, failedVersion: 0 };
  if (!rows.length && hasAnchor(data)) return { state: 'broken' as const, checked: 0, failedVersion: Number.isSafeInteger(Number(data.versionNo)) ? Number(data.versionNo) : 0 };
  return verifyEvidenceVersionChainWithAnchor(rows, { versionNo: data.versionNo, chainSha256: data.versionChainSha256 });
}

export function publicHistoryVersion(row: HistoryVersion) {
  return { ...publicEvidenceVersion(row), recordAvailable: Boolean(row.record_available) };
}

export async function readEvidenceHistoryOverview(db: D1Database) {
  // One transactional read batch keeps counters, anchors and histories on the same snapshot.
  const results = await db.batch([
    db.prepare(`SELECT r.*,COALESCE(v.version_count,0) version_count FROM simple_grc_records r LEFT JOIN (${versionCounts}) v ON v.evidence_id=r.id WHERE r.id IN (${selectedRecords}) ORDER BY r.updated_at DESC,r.id`),
    db.prepare(`SELECT v.* FROM evidence_versions v JOIN simple_grc_records r ON r.id=v.evidence_id AND r.module='Kanıtlar' WHERE r.id IN (${selectedRecords}) ORDER BY r.updated_at DESC,r.id,v.version_no LIMIT 2000`),
    db.prepare(`SELECT COUNT(*) evidence_records,COALESCE(SUM(CASE WHEN ${tracked} THEN 1 ELSE 0 END),0) tracked_evidence,COALESCE(SUM(v.version_count),0) total_versions FROM simple_grc_records r LEFT JOIN (${versionCounts}) v ON v.evidence_id=r.id WHERE r.module='Kanıtlar'`),
    db.prepare(`SELECT COUNT(*) total_versions,COUNT(DISTINCT CASE WHEN r.id IS NULL THEN v.evidence_id END) retained_evidence,COALESCE(SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END),0) retained_versions FROM evidence_versions v LEFT JOIN simple_grc_records r ON r.id=v.evidence_id AND r.module='Kanıtlar'`),
    db.prepare("SELECT COUNT(DISTINCT c.normalized_ref) total FROM evidence_version_controls c JOIN evidence_versions v ON v.id=c.version_id JOIN simple_grc_records r ON r.id=v.evidence_id AND r.module='Kanıtlar'"),
    db.prepare("SELECT v.*,CASE WHEN r.id IS NULL THEN 0 ELSE 1 END record_available FROM evidence_versions v LEFT JOIN simple_grc_records r ON r.id=v.evidence_id AND r.module='Kanıtlar' ORDER BY v.created_at DESC,v.version_no DESC,v.id DESC LIMIT 100"),
  ]);
  const items = results[0].results as unknown as HistoryRecord[], versions = results[1].results as unknown as EvidenceVersionRow[];
  const totals = results[2].results[0] as Record<string, number>, history = results[3].results[0] as Record<string, number>;
  const grouped = new Map<string, EvidenceVersionRow[]>();
  for (const row of versions) { const group = grouped.get(row.evidence_id) || []; group.push(row); grouped.set(row.evidence_id, group); }
  let verifiedChains = 0, brokenChains = 0;
  const evidenceItems = await Promise.all(items.map(async row => {
    const data = recordData(row.data_json), tracked = row.version_count > 0 || hasAnchor(data);
    const integrity = await historyIntegrity(grouped.get(row.id) || [], row.version_count, data);
    if (integrity.state === 'verified') verifiedChains++;
    if (integrity.state === 'broken') brokenChains++;
    return { id: row.id, title: String(data.evidenceTitle || row.id).slice(0, 180), owner: String(data.owner || '').slice(0, 180), period: String(data.period || '').slice(0, 120),
      controlRefs: splitEvidenceControlRefs(data.controlRefs || data.controlRef), currentVersion: Number(data.versionNo || 0), updatedAt: row.updated_at, tracked,
      integrity: integrity.state, checkedVersions: integrity.checked, failedVersion: integrity.failedVersion };
  }));
  const uncheckedChains = Math.max(0, totals.tracked_evidence - verifiedChains - brokenChains);
  return { evidenceItems, evidenceItemsComplete: items.length === totals.evidence_records,
    recentVersions: (results[5].results as unknown as HistoryVersion[]).map(publicHistoryVersion), recentVersionsComplete: history.total_versions <= 100,
    summary: { evidenceRecords: totals.evidence_records, trackedEvidence: totals.tracked_evidence, legacyEvidence: totals.evidence_records - totals.tracked_evidence,
      totalVersions: totals.total_versions, linkedControls: Number((results[4].results[0] as { total: number })?.total || 0), verifiedChains, brokenChains, uncheckedChains,
      integrityScanComplete: uncheckedChains === 0, retainedEvidence: history.retained_evidence, retainedVersions: history.retained_versions } };
}

export async function readEvidenceControlTimeline(db: D1Database, normalized: string) {
  const rows = await db.prepare(`SELECT v.*,CASE WHEN r.id IS NULL THEN 0 ELSE 1 END record_available FROM evidence_version_controls c
    JOIN evidence_versions v ON v.id=c.version_id LEFT JOIN simple_grc_records r ON r.id=v.evidence_id AND r.module='Kanıtlar'
    WHERE c.normalized_ref=? ORDER BY v.created_at DESC,v.version_no DESC,v.id DESC LIMIT 301`).bind(normalized).all<HistoryVersion>();
  return { timeline: rows.results.slice(0, 300).map(publicHistoryVersion), count: Math.min(300, rows.results.length), complete: rows.results.length <= 300 };
}
