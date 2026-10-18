export type RegisterView = { query: string; filters: Record<string, string> };
export const emptyRegisterView = (): RegisterView => ({ query: '', filters: {} });
export const registerViewKey = (userId: string, module: string) => `fornost:register-view:v1:${encodeURIComponent(userId)}:${encodeURIComponent(module)}`;
export function readRegisterView(storage: () => Pick<Storage, 'getItem'>, key: string): RegisterView {
  try {
    const raw = storage().getItem(key);
    if (!raw || raw.length > 16000) return emptyRegisterView();
    const value = JSON.parse(raw);
    if (!value || typeof value.query !== 'string' || value.query.length > 1000 || !value.filters || typeof value.filters !== 'object' || Array.isArray(value.filters)) return emptyRegisterView();
    const filters = Object.fromEntries(Object.entries(value.filters).filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(key) && typeof value === 'string' && value.length <= 1000).slice(0, 20)) as Record<string, string>;
    return { query: value.query, filters };
  } catch { return emptyRegisterView(); }
}
export function writeRegisterView(storage: () => Pick<Storage, 'setItem'>, key: string, view: RegisterView) {
  try { storage().setItem(key, JSON.stringify(view)); } catch { /* Filtering works when browser storage is unavailable. */ }
}
