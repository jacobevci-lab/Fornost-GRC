// Playwright transport errors can contain Cookie/Authorization call logs.
// Emit only an allowlisted category; the caller supplies the known test phase.
export function qaFailureSummary(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  const transport = message.match(/\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND)\b/);
  if (transport) return `Transport failure: ${transport[1]}`;
  if (error?.code === 'ERR_ASSERTION') return 'Assertion failed';
  if (error?.name === 'TimeoutError') return 'Operation timed out';
  return 'QA operation failed';
}

export function ownedEvidenceQaIds(rows, prefix) {
  if (!/^QA-EVIDENCE-FIX-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(prefix)) throw new Error('Exact run identity required');
  return rows.filter(row => {
    let data; try { data = JSON.parse(row.data_json); } catch { return false; }
    return row.module === 'Kontroller' ? data?.controlRef === prefix && data?.controlTitle === prefix
      : row.module === 'Kanıtlar' && [prefix, prefix + ' copy'].includes(data?.evidenceTitle);
  }).map(row => row.id);
}
