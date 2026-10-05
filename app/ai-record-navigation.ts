import { sameDomainModule } from './domain-identity';
import type { FornostNavigationRequest } from './navigation-focus';

export const aiRecordViews = {
  'ai-model': 'models',
  'ai-alert': 'assurance-alerts',
  'ai-finding': 'findings',
} as const;
export type AiRecordKind = keyof typeof aiRecordViews;
export type AiRecordFocus = { kind: AiRecordKind; ref: string };
/** Only native record identity is accepted; display names and free-text references are not resolved here. */
export function aiRecordTarget(kind:unknown,ref:unknown): { view: typeof aiRecordViews[AiRecordKind]; recordFocus:AiRecordFocus } | null {
  if(typeof kind!=="string"||!Object.hasOwn(aiRecordViews,kind)||typeof ref!=="string"||!ref.trim()||ref!==ref.trim()||ref.length>100)return null;
  const recordFocus={kind:kind as AiRecordKind,ref};
  return {view:aiRecordViews[recordFocus.kind],recordFocus};
}
export function resolveAiRecordFocus(request: FornostNavigationRequest | null): AiRecordFocus | null {
  if (!request || request.source !== 'connected-grc-register' || !sameDomainModule(request.module, 'AI Yönetişimi')) return null;
  const kind = request.kind;
  if (!kind || !Object.hasOwn(aiRecordViews, kind) || typeof request.ref !== 'string' || !request.ref.trim() || request.ref.length > 100) return null;
  if (request.filter?.recordRef !== request.ref) return null;
  return { kind: kind as AiRecordKind, ref: request.ref };
}

/** Fail closed on malformed collections rather than displaying stale action targets. */
export function validAiCollection(value: unknown): value is { id: string }[] {
  if (!Array.isArray(value)) return false;
  const ids = value.map(row => row && typeof row === 'object' && !Array.isArray(row) ? row.id : null);
  return ids.every(id => typeof id === 'string' && id.trim()) && new Set(ids).size === ids.length;
}
