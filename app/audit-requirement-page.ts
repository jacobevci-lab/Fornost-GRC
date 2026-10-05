export function auditRequirementPage<T>(rows: T[], requestedPage: number, requestedSize: number) {
  const size = [50, 100, 200].includes(requestedSize) ? requestedSize : 50;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const offset = (page - 1) * size;
  return { rows: rows.slice(offset, offset + size), page, pages, size, start: rows.length ? offset + 1 : 0, end: Math.min(offset + size, rows.length), total: rows.length };
}
