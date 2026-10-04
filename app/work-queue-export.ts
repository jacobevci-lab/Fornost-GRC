export type WorkExportRow = { reference: string; module: string; title: string; owner: string; status: string; due: string; reason: string; updatedAt: string };
export type WorkExportContext = { scope: 'mine' | 'organization'; filter: string; query: string; evaluatedAt: string; refreshedAt: string };
const cell = (value: string) => {
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};
/** Export only the already scoped/filtered view, never a fresh wider read or the current page alone. */
export function buildWorkQueueCsv(rows: WorkExportRow[], context: WorkExportContext): string {
  if (!Number.isFinite(Date.parse(context.evaluatedAt)) || !Number.isFinite(Date.parse(context.refreshedAt))) throw new Error('A verified source timestamp is required');
  const header = ['scope','filter','search','evaluated_at','sources_refreshed_at','reference','module','title','owner','status','due_date','reason','updated_at'];
  return '\ufeff' + [header, ...rows.map(row => [context.scope,context.filter,context.query,context.evaluatedAt,context.refreshedAt,row.reference,row.module,row.title,row.owner,row.status,row.due,row.reason,row.updatedAt])].map(row=>row.map(cell).join(',')).join('\r\n') + '\r\n';
}
