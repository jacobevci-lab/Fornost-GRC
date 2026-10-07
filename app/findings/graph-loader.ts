export const FINDING_GRAPH_LIMIT = 10_000;
const PAGE_SIZE = 500;
const TEXT_BUDGET = 16 * 1024 * 1024;

/** Caller owns cancellation and the deadline across all pages. No partial result on conflict. */
export async function loadFindingGraph(read: (query: string) => Promise<unknown>) {
  const findings: Record<string, unknown>[] = [];
  const ids = new Set<string>();
  let revision = '', after = '', total = 0, size = 0;
  for (let page = 0; page < FINDING_GRAPH_LIMIT / PAGE_SIZE; page++) {
    const params = new URLSearchParams({ view: 'graph' });
    if (after) { params.set('after', after); params.set('revision', revision); }
    const raw = await read(params.toString());
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid graph page');
    const body = raw as Record<string, unknown>;
    const rows = body.findings;
    if (!Array.isArray(rows) || rows.length > PAGE_SIZE || typeof body.complete !== 'boolean'
      || typeof body.revision !== 'string' || !/^[a-f0-9]{32}$/.test(body.revision)
      || (revision && revision !== body.revision)) throw new Error('Invalid graph revision');
    if (!page) {
      if (!Number.isSafeInteger(body.total) || Number(body.total) < 0) throw new Error('Invalid graph total');
      total = Number(body.total); revision = body.revision;
    } else if (body.total !== undefined && body.total !== total) throw new Error('Changed graph total');
    let last = after;
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id.trim()
        || row.id <= last || ids.has(row.id.normalize('NFKC').trim())) throw new Error('Invalid graph identity');
      last = row.id; ids.add(row.id.normalize('NFKC').trim());
    }
    const loaded = findings.length + rows.length;
    if (loaded > total || (body.complete ? loaded !== total || body.nextCursor !== null : rows.length !== PAGE_SIZE || body.nextCursor !== last || loaded >= total)) throw new Error('Invalid graph cursor');
    size += JSON.stringify(rows).length * 2;
    if (size > TEXT_BUDGET) return { findings, graphCoverage: { total, loaded: findings.length, complete: false } };
    findings.push(...rows);
    if (body.complete) return { findings, graphCoverage: { total, loaded, complete: true } };
    after = last;
  }
  return { findings, graphCoverage: { total, loaded: findings.length, complete: false } };
}
