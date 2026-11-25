import { coreRecordReference, isCoreRecordRequest } from './core-record-focus';
import type { FornostNavigationRequest } from './navigation-focus';
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const coreRecordSessionKey = (userId: string) => `fornost-record-context:v1:${encodeURIComponent(userId)}`;
/** Navigation hints only: caller re-fetches authorized records before resolving. */
export function readCoreRecordSession(storage: () => StorageLike, userId: string, allowed: (module: string) => boolean): FornostNavigationRequest | null {
  try {
    const raw = storage().getItem(coreRecordSessionKey(userId));
    if (!raw || raw.length > 8000) return null;
    const value = JSON.parse(raw) as FornostNavigationRequest;
    if (!value || typeof value.module !== 'string' || typeof value.ref !== 'string' || !allowed(value.module) || !isCoreRecordRequest(value) || !coreRecordReference(value) || coreRecordReference(value).length > 512) return null;
    const returnTo = value.returnTo;
    if (returnTo && (typeof returnTo.module !== 'string' || !allowed(returnTo.module) || (returnTo.filter && (typeof returnTo.filter !== 'object' || Array.isArray(returnTo.filter) || Object.entries(returnTo.filter).some(([key, v]) => key.length > 100 || typeof v !== 'string' || v.length > 1000))))) return { module: value.module, kind: 'record', ref: coreRecordReference(value), source: 'restored-record' };
    return { module: value.module, kind: 'record', ref: coreRecordReference(value), source: 'restored-record', returnTo };
  } catch { return null; }
}
export function writeCoreRecordSession(storage: () => StorageLike, userId: string, request: FornostNavigationRequest | null) {
  try {
    if (request) storage().setItem(coreRecordSessionKey(userId), JSON.stringify({ module: request.module, kind: 'record', ref: coreRecordReference(request), source: request.source, returnTo: request.returnTo }));
    else storage().removeItem(coreRecordSessionKey(userId));
  } catch { /* Optional per-tab preferences cannot prevent navigation. */ }
}
