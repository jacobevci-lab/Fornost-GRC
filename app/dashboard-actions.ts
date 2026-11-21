import type { AssuranceRow } from "./control-assurance";
import type { EnterpriseWorkRow } from "./enterprise-work";
import type { Overview } from "./framework-posture/types";
import { auditRequirementDeadline, isClosedAuditRequirement, isOverdueAuditRequirement } from "./audit-overdue-requirements";
import { connectedTitle } from "./connected-grc-model";
import { dueTimestamp } from "./due-date";
import { evidenceRenewals } from "./executive-report-data";
import { isAuditTaskKind, type FornostNavigationRequest } from "./navigation-focus";
import { isLegacyTechnicalRecordId } from "./record-codes";

export function frameworkPortfolio(overview?: Overview) {
  if (!Array.isArray(overview?.enrolled)) return null;
  const count = overview.enrolled.length;
  let scope = 0;
  let compliant = 0;
  let complete = true;
  let lowest: { name: string; rate: number } | null = null;
  for (const name of overview.enrolled) {
    const item = overview.coverage?.[name];
    if (!item || ![item.scope, item.compliant, item.assessed].every(n => Number.isSafeInteger(n) && n >= 0)
      || item.assessed > item.scope || item.compliant > item.assessed) {
      return { count, scope: null, compliant: null, score: null, lowest: null };
    }
    scope += item.scope;
    compliant += item.compliant;
    if (!item.scope) continue;
    if (!item.assessed) {
      complete = false;
      continue;
    }
    const rate = item.compliant / item.scope;
    if (!lowest || rate < lowest.rate) lowest = { name, rate };
  }
  return { count, scope, compliant, score: complete && scope ? compliant / scope * 100 : null, lowest: complete ? lowest : null };
}

const text = (value: unknown) => String(value ?? "").trim();
const reviewStates = new Set([
  "incelemede", "inceleme bekliyor", "onay bekliyor", "onay bekleniyor", "onaya gönderildi",
  "doğrulama bekliyor", "submitted", "gönderildi", "in review", "in-review", "under review",
  "review", "pending-review", "pending approval", "approval pending", "verification", "verification pending",
]);
const isPending = (value: unknown) => reviewStates.has(text(value).toLowerCase().replace(/i\u0307/g, "i"));

export function dashboardCode(row: AssuranceRow) {
  const code = text(row.code || row.id);
  if (row.module === "Risk Assessment" && !/^RSK-\d+$/i.test(code)) return "—";
  return !code || isLegacyTechnicalRecordId(code) || /[a-f0-9]{8}-[a-f0-9]{4}-/i.test(code) ? "—" : code;
}

export const recordOwner = (row: AssuranceRow) =>
  text(row.data.owner || row.data.riskOwner || row.data.responsible || row.data.auditOwner || row.data.assignee) || "—";

export const dashboardRecord = (row: AssuranceRow): FornostNavigationRequest =>
  ({ module: row.module, kind: "record", ref: row.id, source: "dashboard-action", returnTo: { module: "Ana Sayfa" } });

export type ActionGroup = "all" | "findings" | "renewals" | "approvals";
export type DashboardAction = {
  id: string; code: string; title: string; owner: string; due: string;
  reason: "audit" | "finding" | "renewal" | "approval"; groups: ActionGroup[]; target: FornostNavigationRequest;
};

export function priorityActions(rows: AssuranceRow[], findings: AssuranceRow[], enterprise: EnterpriseWorkRow[], now: number) {
  const actions: DashboardAction[] = [];
  const renewals = evidenceRenewals(rows, now);
  const days = new Map(renewals.all.flatMap(group => group.rows.map(row => [row.id, group.day] as const)));

  function add(row: AssuranceRow, reason: DashboardAction["reason"], due: string, groups: ActionGroup[], target = dashboardRecord(row)) {
    const title = connectedTitle(row);
    const reviewer = reason === "approval" && text(row.data.reviewer || row.data.approver);
    actions.push({ id: row.id, code: dashboardCode(row), title: title === row.id ? "—" : title,
      owner: reviewer || recordOwner(row), due, reason, groups, target });
  }

  for (const row of rows) {
    const data = row.data;
    const review = !isClosedAuditRequirement(data.status) && [data.status, data.reviewStatus, data.approvalStatus].some(isPending);
    const groups: ActionGroup[] = review ? ["approvals"] : [];
    const renewal = days.get(row.id);
    if (renewal) add(row, "renewal", renewal, [...groups, "renewals"]);
    else if (row.module === "Denetim Yönetimi" && isOverdueAuditRequirement(data, now))
      add(row, "audit", auditRequirementDeadline(data), groups);
    else if (review) add(row, "approval", text(data.dueDate || data.targetDate || data.nextReview), groups);
  }

  for (const row of findings) {
    if (["closed", "accepted", "cancelled"].includes(text(row.data.status))) continue;
    const review = isPending(row.data.status);
    add(row, review ? "approval" : "finding", text(row.data.dueDate), review ? ["findings", "approvals"] : ["findings"],
      { ...dashboardRecord(row), kind: "finding" });
  }
  for (const row of enterprise) {
    if (row.data.workClosed || !(row.data.workWaitingForReview || isPending(row.data.status))) continue;
    add(row, "approval", text(row.data.dueDate), ["approvals"], {
      ...dashboardRecord(row), kind: row.workKind, ref: row.nativeRef,
      ...(isAuditTaskKind(row.workKind) ? { filter: { auditId: text(row.data.auditId) } } : {}),
    });
  }
  actions.sort((a, b) => dueTimestamp(a.due) - dueTimestamp(b.due) || a.code.localeCompare(b.code) || a.id.localeCompare(b.id));
  return { actions, undated: renewals.undated };
}
