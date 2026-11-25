import { sameDomainModule } from './domain-identity';
import type { FornostNavigationRequest } from './navigation-focus';
import { validAssuranceQueue } from './assurance-queue-access';

/** Work identities are opaque, case-sensitive IDs, never free-text searches. */
export function parseAssuranceWorkId(value: string | null): string | null {
  if (value === null) return null;
  if (!value || value.length > 120 || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid assurance work ID.');
  return value;
}

export function assuranceWorkFocus(request: FornostNavigationRequest | null): string | null {
  if (!request || request.kind !== 'assurance-work' || !sameDomainModule(request.module, 'Bağlantılı GRC')) return null;
  try { return parseAssuranceWorkId(request.ref ?? null); } catch { return null; }
}

export function assuranceWorkNavigation(priority: {id:string;kind:string}): FornostNavigationRequest | null {
  if (priority.kind !== 'work-item' || !priority.id.startsWith('work:')) return null;
  try {
    const ref = parseAssuranceWorkId(priority.id.slice(5));
    return ref ? {module:'Bağlantılı GRC',kind:'assurance-work',ref,source:'assurance-work-priority'} : null;
  } catch { return null; }
}

export function validFocusedAssuranceQueue(body: Record<string,unknown>, id: string): boolean {
  if (!validAssuranceQueue(body) || body.workItemId !== id || body.filter !== 'all' || body.nextCursor !== null) return false;
  const rows = body.items as Array<{id:string}>;
  const coverage = body.coverage as {loaded?:unknown;complete?:unknown} | undefined;
  return rows.length <= 1 && rows.every(row => row.id === id) && coverage?.complete === true && coverage.loaded === rows.length;
}
