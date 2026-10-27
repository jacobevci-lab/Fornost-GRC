export function publicContinuityPlan(x: Record<string, unknown>) {
  return {
    id: String(x.id), code: String(x.code), name: String(x.name), process: String(x.process), biaRef: String(x.bia_ref),
    criticality: String(x.criticality), owner: String(x.owner), reviewer: String(x.reviewer), crisisLead: String(x.crisis_lead),
    rtoHours: Number(x.rto_hours), rpoHours: Number(x.rpo_hours), mtpdHours: Number(x.mtpd_hours),
    dependencies: String(x.dependencies), recoveryStrategy: String(x.recovery_strategy), communicationPlan: String(x.communication_plan),
    alternateSite: String(x.alternate_site || ''), supplierDependencies: String(x.supplier_dependencies || ''),
    minimumStaff: Number(x.minimum_staff), reviewDate: String(x.review_date), status: String(x.status), version: Number(x.version),
    updatedAt: String(x.updated_at), createdBy: String(x.created_by),
  };
}
export type ContinuityPlan = ReturnType<typeof publicContinuityPlan>;
export type ContinuityPlanReview = {
  id: string; planId: string; previousDate: string; nextDate: string; note: string; actor: string; reviewedAt: string;
  snapshot: ContinuityPlan | null;
};
export type ContinuityReviewWorkspace = { plan: ContinuityPlan; canReview: boolean; reviews: ContinuityPlanReview[]; hasMore: boolean; historyVerified: boolean };

export function independentPlanReviewer(plan: ContinuityPlan, actor: { role: string; email: string }) {
  const email = actor.email.toLowerCase();
  return actor.role === 'Admin' && plan.reviewer.toLowerCase() === email &&
    ![plan.owner, plan.crisisLead, plan.createdBy].some(value => value.toLowerCase() === email);
}

export function validPlanReviewDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function minimumNextPlanReview(current: string, today = new Date().toISOString().slice(0, 10)) {
  const anchor = validPlanReviewDate(current) && current > today ? current : today;
  const next = new Date(Date.parse(anchor) + 86400000).toISOString().slice(0, 10);
  return validPlanReviewDate(next) ? next : '9999-12-31';
}
