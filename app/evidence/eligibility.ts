const key = (value: unknown) => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('tr-TR');

/** A date-only validity includes the entire UTC day; a timestamp expires exactly. */
export function evidenceExpiryTime(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const day = raw.slice(0, 10), calendar = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(calendar) || new Date(calendar).toISOString().slice(0, 10) !== day) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return calendar + 86400000;
  return /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(raw) ? Date.parse(raw) : NaN;
}

export function evaluateEvidenceEligibility(data: Record<string, unknown>, now = new Date()) {
  const dates = [data.expiresAt, data.freshUntil].map(evidenceExpiryTime).filter(value => value !== null);
  const expired = dates.some(value => !Number.isFinite(value) || value! <= now.getTime());
  const rejected = [data.status, data.reviewStatus].some(value => ['süresi doldu', 'expired', 'stale', 'reddedildi', 'rejected'].includes(key(value)));
  const failed = ['fail', 'failed', 'error', 'invalid'].includes(key(data.validationStatus));
  const integrity = key(data.evidenceIntegrity);
  const invalid = expired || rejected || failed || integrity === 'broken';
  const approved = ['onaylandı', 'approved', 'güncel', 'current', 'kabul edildi', 'accepted', 'valid', 'geçerli'].includes(key(data.status));
  const awaitingReview = ['pending', 'pending-review', 'in-review', 'draft', 'bekliyor', 'incelemede', 'taslak'].includes(key(data.reviewStatus));
  return { current: approved && !invalid && !awaitingReview && integrity !== 'unavailable', invalid, expired, approved, awaitingReview };
}
