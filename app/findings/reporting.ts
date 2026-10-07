import { requestJsonWithDeadline } from '../bounded-json-request';
import type { ReportRecord } from '../report-export';

export const CAPA_REPORT_MODULE = 'Bulgular ve CAPA';
export const CAPA_REPORT_LIMIT = 100_000;
export const CAPA_REPORT_PAGE_SIZE = 500;
// Explicit projection: do not export internal columns or unrelated workflow stores.
const fields: Record<string, string> = {
  title: 'title', description: 'description', sourceType: 'source_type', sourceRef: 'source_ref',
  sourceTitle: 'source_title', findingType: 'finding_type', severity: 'severity', status: 'status',
  owner: 'owner', reviewer: 'reviewer', dueDate: 'due_date', riskRef: 'risk_ref', controlRef: 'control_ref',
  rootCause: 'root_cause', correctiveAction: 'corrective_action', preventiveAction: 'preventive_action',
  evidenceReference: 'evidence_reference', evidenceSha256: 'evidence_sha256',
  verificationEvidenceReference: 'verification_evidence_reference', verificationEvidenceSha256: 'verification_evidence_sha256',
  acceptanceRationale: 'acceptance_rationale', acceptUntil: 'accept_until', recurrenceCount: 'recurrence_count',
};

export function findingReportRecord(row: Record<string, unknown>): ReportRecord & { id: string } {
  if (typeof row.id !== 'string' || !row.id) throw new Error('Invalid finding identifier');
  return {
    id: `capa:${row.id}`, code: String(row.code || row.id), module: CAPA_REPORT_MODULE,
    createdAt: String(row.detected_at || ''), updatedAt: String(row.updated_at || ''),
    data: Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, row[column] ?? ''])),
  };
}

export function parseCapaReport(body: Record<string, unknown>): Array<ReportRecord & { id: string }> {
  if (body.complete !== true || !Array.isArray(body.rows) || body.rows.length > CAPA_REPORT_LIMIT) throw new Error('Incomplete findings report');
  const ids = new Set<string>();
  for (const row of body.rows) {
    if (!row || typeof row.id !== 'string' || !row.id.startsWith('capa:') || ids.has(row.id)
      || row.module !== CAPA_REPORT_MODULE || !row.data || typeof row.data !== 'object' || Array.isArray(row.data)) throw new Error('Invalid findings report');
    ids.add(row.id);
  }
  return body.rows;
}


/** Publish one complete, single-revision dataset; never expose a partial load. */
export async function loadCapaReport(url: string, signal: AbortSignal, fetcher: typeof fetch = fetch,
  onProgress: (loaded: number) => void = () => {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort',abort,{once:true});
  if (signal.aborted) abort();
  const timer = setTimeout(abort,120_000);
  const rows: Array<ReportRecord & {id:string}> = [];
  const ids = new Set<string>();
  let cursor: string | null = null, revision = '', memoryBytes = 0, total = 0;
  try {
    for (let page = 0; page < CAPA_REPORT_LIMIT / CAPA_REPORT_PAGE_SIZE; page++) {
      const address = cursor === null ? url : `${url}&after=${encodeURIComponent(cursor)}&revision=${revision}`;
      const {response,body} = await requestJsonWithDeadline(address,{signal:controller.signal,cache:'no-store'},fetcher);
      if (!response.ok) throw new Error(response.status === 409 ? 'CAPA changed during loading; refresh required' : 'CAPA report unavailable');
      if (typeof body.revision !== 'string' || !/^[a-f0-9]{32}$/.test(body.revision)
        || (revision && revision !== body.revision) || typeof body.complete !== 'boolean'
        || !Array.isArray(body.rows) || body.rows.length > CAPA_REPORT_PAGE_SIZE) throw new Error('Invalid report page');
      if (page === 0) {
        if (!Number.isSafeInteger(body.total) || Number(body.total) < 0 || Number(body.total) > CAPA_REPORT_LIMIT) throw new Error('Invalid report total');
        total = Number(body.total);
      }
      revision = body.revision;
      const records = parseCapaReport({...body,complete:true});
      memoryBytes += JSON.stringify(body).length * 2;
      if (memoryBytes > 32 * 1024 * 1024) throw new Error('Report exceeds browser memory budget');
      for (const row of records) {
        if (ids.has(row.id)) throw new Error('Duplicate report record across pages');
        ids.add(row.id); rows.push(row);
      }
      if (body.complete) {
        if (body.nextCursor !== null || rows.length !== total) throw new Error('Incomplete final report page');
        return rows;
      }
      if (records.length !== CAPA_REPORT_PAGE_SIZE || typeof body.nextCursor !== 'string'
        || body.nextCursor === cursor || body.nextCursor !== records.at(-1)!.id.slice(5)) throw new Error('Invalid report continuation');
      cursor = body.nextCursor;
      onProgress(rows.length);
    }
    throw new Error('Report exceeds browser record budget');
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort',abort);
  }
}
