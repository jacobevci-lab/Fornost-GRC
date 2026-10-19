import { CORE_RECORD_MODULES } from './core-record-focus';
import type { FornostNavigationRequest } from './navigation-focus';
export type RecordLinkTarget = { module: string; kind: 'record' | 'audit-request' | 'audit-workpaper'; ref: string; auditId?: string };
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(v);
export function recordLinkTarget(value: unknown): RecordLinkTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.module !== 'string' || !CORE_RECORD_MODULES.has(v.module) || !id(v.ref)) return null;
  if (v.kind === 'record' && !v.auditId) return { module: v.module, kind: 'record', ref: v.ref };
  if (v.module === 'Denetim Yönetimi' && ['audit-request', 'audit-workpaper'].includes(String(v.kind)) && id(v.auditId)) return { module: v.module, kind: v.kind as RecordLinkTarget['kind'], ref: v.ref, auditId: v.auditId };
  return null;
}
export function recordLinkFragment(target: RecordLinkTarget) {
  const valid = recordLinkTarget(target); if (!valid) throw new Error('Invalid record link');
  return '#fornost-record?' + new URLSearchParams(valid).toString();
}
export function parseRecordLink(hash: string): RecordLinkTarget | null {
  if (!hash.startsWith('#fornost-record?') || hash.length > 1500) return null;
  const params = new URLSearchParams(hash.slice('#fornost-record?'.length));
  if ([...params.keys()].some(key => !['module', 'kind', 'ref', 'auditId'].includes(key) || params.getAll(key).length !== 1)) return null;
  return recordLinkTarget(Object.fromEntries(params));
}
/** Explicit administrator-configured installation URL; never infer it from request headers. */
export function applicationLinkBase(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 1500 || /[\\\s?#]/.test(value)) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password || /%2f|%5c|%2e|%00|%0a|%0d/i.test(u.pathname)) return null;
    return u.origin + u.pathname.replace(/\/+$/, '') + '/';
  } catch { return null; }
}
export function absoluteRecordLink(base: unknown, target: RecordLinkTarget): string | null {
  const url = applicationLinkBase(base); return url ? url + recordLinkFragment(target) : null;
}
export function recordLinkNavigation(target: RecordLinkTarget, scoped = false): FornostNavigationRequest {
  return { module: target.module, kind: target.module === 'Tedarikçiler' && !scoped ? 'vendor-review' : target.kind, ref: target.ref, source: 'shared-record-link', ...(target.auditId ? { filter: { auditId: target.auditId } } : {}) };
}
