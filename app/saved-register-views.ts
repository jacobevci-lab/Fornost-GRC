export type SavedViewState = { query: string; filters: Record<string, string>; columns: string[] };
export type SavedRegisterView = SavedViewState & { id: string; name: string; updatedAt: string };
export type ViewSchema = { filters: string[]; columns: string[] };
export const savedViewsKey = (userId: string, module: string) => `fornost:saved-register-views:v1:${encodeURIComponent(userId)}:${encodeURIComponent(module)}`;
export class SavedViewError extends Error {}
const fail = (message: string): never => { throw new SavedViewError(message); };
const nameKey = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('tr-TR');
export function validateViewState(value: unknown, schema?: ViewSchema): SavedViewState {
  if (!value || typeof value !== 'object') return fail('invalid');
  const v = value as SavedViewState;
  if (typeof v.query !== 'string' || v.query.length > 1000 || !v.filters || typeof v.filters !== 'object' || Array.isArray(v.filters) || Object.keys(v.filters).length > 20 || !Array.isArray(v.columns) || !v.columns.length || v.columns.length > 80 || new Set(v.columns).size !== v.columns.length) return fail('invalid');
  if (Object.entries(v.filters).some(([k, x]) => !/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(k) || typeof x !== 'string' || x.length > 1000) || v.columns.some(k => typeof k !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(k))) return fail('invalid');
  if (schema && (Object.keys(v.filters).some(k => !schema.filters.includes(k)) || v.columns.some(k => !schema.columns.includes(k)))) return fail('schema');
  return { query: v.query, filters: Object.fromEntries(Object.entries(v.filters).filter(([, x]) => x !== '')), columns: [...v.columns] };
}
export function parseSavedViews(raw: string | null): SavedRegisterView[] {
  if (raw === null) return [];
  if (raw.length > 250000) return fail('invalid');
  let payload; try { payload = JSON.parse(raw); } catch { return fail('invalid'); }
  if (payload?.version !== 1 || !Array.isArray(payload.views) || payload.views.length > 10) return fail('invalid');
  const ids = new Set<string>(), names = new Set<string>();
  return payload.views.map((v: SavedRegisterView) => {
    if (!v || typeof v.id !== 'string' || !/^[\w-]{1,80}$/.test(v.id) || ids.has(v.id) || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 60 || names.has(nameKey(v.name)) || typeof v.updatedAt !== 'string' || !Number.isFinite(Date.parse(v.updatedAt))) return fail('invalid');
    ids.add(v.id); names.add(nameKey(v.name));
    return { ...validateViewState(v), id: v.id, name: v.name.trim(), updatedAt: v.updatedAt };
  });
}
export type ViewChange = { action: 'create' | 'replace' | 'rename' | 'delete'; id: string; name?: string; state?: SavedViewState; expectedItem?: string };
export function changeSavedViews(raw: string | null, change: ViewChange, schema: ViewSchema, now = new Date().toISOString()): SavedRegisterView[] {
  const views = parseSavedViews(raw), old = views.find(v => v.id === change.id);
  if (change.action !== 'create' && (!old || JSON.stringify(old) !== change.expectedItem)) return fail('conflict');
  if (change.action === 'delete') return views.filter(v => v.id !== change.id);
  const name = (change.name || '').trim();
  if (!name || name.length > 60) return fail('name');
  if (views.some(v => v.id !== change.id && nameKey(v.name) === nameKey(name))) return fail('duplicate');
  if (change.action === 'create' && (old || views.length >= 10)) return fail(old ? 'conflict' : 'limit');
  const state = change.action === 'rename' ? validateViewState(old) : validateViewState(change.state, schema);
  const row = { ...state, id: change.id, name, updatedAt: now };
  const next = change.action === 'create' ? [...views, row] : views.map(v => v.id === change.id ? row : v);
  // Apply the same structural bounds to writes and reads.
  return parseSavedViews(JSON.stringify({ version: 1, views: next }));
}
export function persistSavedViews(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string, expectedRaw: string | null, change: ViewChange, schema: ViewSchema): SavedRegisterView[] {
  if (storage.getItem(key) !== expectedRaw) return fail('conflict');
  const next = changeSavedViews(expectedRaw, change, schema);
  storage.setItem(key, JSON.stringify({ version: 1, views: next }));
  return next;
}
