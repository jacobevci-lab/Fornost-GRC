import { findingReportRecord, CAPA_REPORT_PAGE_SIZE } from './reporting';

export const FINDING_REPORT_PAGE_SIZE = CAPA_REPORT_PAGE_SIZE;
// Every writer, including CAPA promotion, changes the revision in the same transaction.
export const findingReportSchema = [
  `CREATE TABLE IF NOT EXISTS finding_report_revision(id INTEGER PRIMARY KEY CHECK(id=1),revision TEXT NOT NULL)`,
  `INSERT OR IGNORE INTO finding_report_revision(id,revision) VALUES(1,lower(hex(randomblob(16))))`,
  ...['INSERT','UPDATE','DELETE'].map(operation => `CREATE TRIGGER IF NOT EXISTS finding_report_${operation.toLowerCase()} AFTER ${operation} ON enterprise_findings BEGIN UPDATE finding_report_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END`),
];

export class FindingReportPageError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function readFindingReportPage(db: D1Database, after: string | null, expectedRevision: string | null) {
  if ((after === null) !== (expectedRevision === null) || (after !== null && (!after || after.length > 200))
    || (expectedRevision !== null && !/^[a-f0-9]{32}$/.test(expectedRevision))) throw new FindingReportPageError('Invalid report cursor',400);
  // A D1 batch is transactional: revision and page belong to the same database state.
  const [version, page] = await db.batch([
    db.prepare(after === null ? 'SELECT revision,(SELECT COUNT(*) FROM enterprise_findings) AS total FROM finding_report_revision WHERE id=1' : 'SELECT revision FROM finding_report_revision WHERE id=1'),
    db.prepare('SELECT * FROM enterprise_findings WHERE id > ? ORDER BY id LIMIT ?').bind(after || '', FINDING_REPORT_PAGE_SIZE + 1),
  ]);
  const revision = String((version.results[0] as Record<string, unknown>)?.revision || '');
  if (!/^[a-f0-9]{32}$/.test(revision)) throw new FindingReportPageError('Report revision unavailable',503);
  if (expectedRevision !== null && revision !== expectedRevision) throw new FindingReportPageError('CAPA records changed during report loading. Refresh the report.',409);
  const complete = page.results.length <= FINDING_REPORT_PAGE_SIZE;
  const records = page.results.slice(0,FINDING_REPORT_PAGE_SIZE) as Record<string,unknown>[];
  return {rows:records.map(findingReportRecord), revision, total:after === null ? Number((version.results[0] as Record<string,unknown>).total) : undefined, complete, nextCursor:complete ? null : String(records.at(-1)!.id), generatedAt:new Date().toISOString()};
}
