import { readableModules, type AccessSubject } from './module-access';

export type RecordSearchResult = { id: string; module: string; code: string; title: string; owner: string; status: string };
export type RecordSearchPage = { results: RecordSearchResult[]; nextCursor: string | null };
export class SearchInputError extends Error {}
export function foldSearch(value: string) {
  return value.replace(/[İıI]/g, 'i').replace(/Ç/g, 'ç').replace(/Ğ/g, 'ğ').replace(/Ö/g, 'ö').replace(/Ş/g, 'ş').replace(/Ü/g, 'ü').toLowerCase();
}
// SQLite LOWER only folds ASCII. Keep this expression aligned with foldSearch.
function foldSql(expression: string) {
  for (const [from, to] of [['İ', 'i'], ['ı', 'i'], ['I', 'i'], ['Ç', 'ç'], ['Ğ', 'ğ'], ['Ö', 'ö'], ['Ş', 'ş'], ['Ü', 'ü']])
    expression = `replace(${expression},'${from}','${to}')`;
  return `lower(${expression})`;
}
const fields = ['title', 'process', 'controlTitle', 'evidenceTitle', 'requirementTitle', 'owner', 'riskOwner', 'controlOwner', 'controlRef', 'requirementRef', 'auditName', 'service'];
const data = "CASE WHEN json_valid(r.data_json) THEN r.data_json ELSE '{}' END";
const field = (key: string) => `COALESCE(CAST(json_extract(${data},'$.${key}') AS TEXT),'')`;
const searchable = foldSql(["r.id", "COALESCE(c.code,'')", ...fields.map(field)].join(" || ' ' || "));
const title = `COALESCE(${['title', 'process', 'controlTitle', 'evidenceTitle', 'requirementTitle'].map(key => `NULLIF(${field(key)},'')`).join(',')},r.id)`;

/** Authorization is applied in SQL before pagination; no full record payload is exposed. */
export async function searchRecords(db: D1Database, actor: AccessSubject, params: URLSearchParams): Promise<RecordSearchPage> {
  const query = (params.get('q') || '').trim(), moduleName = params.get('module') || '';
  if (query.length < 2 || query.length > 120) throw new SearchInputError('Search requires 2–120 characters.');
  const allowed = readableModules(actor), scope = allowed.join('|');
  if (moduleName && !allowed.includes(moduleName as typeof allowed[number])) throw new SearchInputError('Module is unavailable.');
  const q = foldSearch(query), raw = params.get('cursor');
  let after = '';
  if (raw !== null) {
    try {
      if (raw.length > 1800) throw new Error();
      const cursor = JSON.parse(raw);
      if (!cursor || cursor.q !== q || cursor.module !== moduleName || cursor.scope !== scope || typeof cursor.id !== 'string' || !cursor.id || cursor.id.length > 200) throw new Error();
      after = cursor.id;
    } catch { throw new SearchInputError('Invalid search cursor.'); }
  }
  const modules = moduleName ? [moduleName] : allowed;
  if (!modules.length) return { results: [], nextCursor: null };
  const rows = await db.prepare(`SELECT r.id,r.module,COALESCE(c.code,r.id) code,
    substr(${title},1,500) title,substr(${field('owner')},1,200) owner,substr(${field('status')},1,100) status
    FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id AND c.module=r.module
    WHERE r.module IN (${modules.map(() => '?').join(',')}) AND r.id > ? AND instr(${searchable},?) > 0
    ORDER BY r.id ASC LIMIT 26`).bind(...modules, after, q).all<RecordSearchResult>();
  if (!rows.success || !Array.isArray(rows.results)) throw new Error('Search unavailable');
  const results = rows.results.slice(0, 25);
  return { results, nextCursor: rows.results.length > 25 ? JSON.stringify({ q, module: moduleName, scope, id: results.at(-1)!.id }) : null };
}
