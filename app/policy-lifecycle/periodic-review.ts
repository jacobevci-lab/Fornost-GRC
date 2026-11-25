export type PolicyReviewRow = Record<string, string | number | null>;
export type PolicyReviewSource = { policy: PolicyReviewRow; version: PolicyReviewRow; revision: string; pendingRevision: boolean; contentVerified: boolean };
export type PolicyReview = { id: string; actor: string; reviewedAt: string; previousDate: string; nextDate: string; note: string; snapshot: PolicyReviewSource | null };
export type PolicyReviewWorkspace = PolicyReviewSource & { canReview: boolean; minimumDate: string; maximumDate: string; reviews: PolicyReview[]; hasMore: boolean; historyVerified: boolean };
export function independentPolicyReviewer(source: PolicyReviewSource, actor: { role: string; email: string }) {
  const email = actor.email.toLowerCase(), { policy, version } = source;
  return actor.role === 'Admin' && !!email && String(policy.reviewer).toLowerCase() === email &&
    ![policy.owner, policy.created_by, version.created_by, version.submitted_by].some(value => String(value || '').toLowerCase() === email);
}
export function validPolicyReviewDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function policyReviewWindow(previous: string, frequency: number, today = new Date().toISOString().slice(0, 10)) {
  const add = (date: string, days: number) => new Date(Math.min(Date.parse('9999-12-31T00:00:00Z'), Date.parse(`${date}T00:00:00Z`) + days * 86400000)).toISOString().slice(0, 10);
  return { minimumDate: add(previous > today ? previous : today, 1), maximumDate: add(today, frequency) };
}
