import { matchesWorkIdentity } from "./work-queue";

type WorkRecord = { module: string; workKind?: string; data: Record<string, unknown> };
type Identity = { name?: string; email?: string; role?: string };
const values = (...items: unknown[]) => items.map(value => String(value ?? "").trim()).filter(Boolean);
const normalized = (value: unknown) => String(value ?? "").normalize("NFKC").toLowerCase()
  .replace(/i\u0307/g, "i").replace(/[-_]+/g, " ").trim();
const pending = new Set(["incelemede", "under review", "in review", "review", "submitted", "gönderildi",
  "verification pending", "verification", "doğrulama bekliyor", "approval pending", "pending approval",
  "pending review", "onay bekliyor", "onaya gönderildi"]);

export function workRoles(row: WorkRecord, user: Identity) {
  const d = row.data;
  const owners = values(d.owner, d.ownerEmail, d.riskOwner, d.actionOwner, d.actionOwnerEmail, d.followUpOwner, d.testOwner,
    d.evidenceOwner, d.auditOwner, d.technicalOwner, d.custodian);
  const reviewers = values(d.reviewer, d.reviewerEmail, d.approver, d.approverEmail);
  const owner = matchesWorkIdentity(owners, user);
  const reviewer = !owner && !matchesWorkIdentity(values(d.submittedBy, d.detectedBy), user) && matchesWorkIdentity(reviewers, user);
  const reviewStage = typeof d.workWaitingForReview === "boolean" ? d.workWaitingForReview
    : [d.status, d.reviewStatus, d.approvalStatus].some(value => pending.has(normalized(value)))
      || [d.reviewStatus, d.approvalStatus].some(value => ["pending", "bekliyor"].includes(normalized(value)))
      || (row.workKind === "policy-version" && d.status === "approved");
  const waiting = owner && ((row.workKind === "audit-milestone" && Number(d.blockedCount) > 0)
    || (reviewStage && reviewers.length > 0 && !matchesWorkIdentity(reviewers, user)));
  const evidenceRequest = row.module === "Kanıtlar" && (reviewStage || Object.hasOwn(d, "reviewer") ||
    Object.hasOwn(d, "approver") || ["requested", "talep edildi"].includes(normalized(d.status)));
  const assignable = ["Risk Assessment", "Bulgular ve CAPA"].includes(row.module) || evidenceRequest || row.workKind === "audit-request";
  const missingOwner = owners.length === 0;
  const missingReviewer = assignable && !reviewers.length && !d.assignedReviewer;
  const adminReview = row.module === "Bulgular ve CAPA" ||
    ["incident", "audit-closure", "vendor-assessment", "vendor-finding"].includes(row.workKind || "");
  const canApprove = user.role !== "Viewer" && (!adminReview || user.role === "Admin");
  return { owner, reviewer, awaitingReview: reviewer && reviewStage && canApprove, waiting, ownerName: owners[0] || "—",
    unassigned: assignable && (missingOwner || missingReviewer), missingOwner, missingReviewer };
}

export const workCopy = {
  all:["Tümü","All"], owner:["Bana Atananlar (Sahip)","Assigned to me (Owner)"],
  reviewer:["Onayım Bekleyenler (Reviewer)","Awaiting my approval (Reviewer)"],
  waiting:["Başkalarında Bekleyen","Waiting for others"], unassigned:["Atama Bekleyenler","Unassigned"],
  ownerRole:["Sahip","Owner"], reviewerRole:["Bağımsız Reviewer","Independent reviewer"],
  otherRole:["Organizasyon","Organization"], noOwner:["Sahip atanmamış","Owner unassigned"],
  noReviewer:["İncelemeci atanmamış","Reviewer unassigned"], review:["İncele →","Review →"],
  empty:["Şu an üzerinize atanmış açık görev bulunmuyor","You have no open tasks assigned to you"],
  risk:["Risk Değerlendirmesi","Risk Assessment"], evidence:["Kanıt Kütüphanesi","Evidence Library"],
  audit:["Denetim Yönetimi","Audit Management"], exportHint:["CSV dışa aktarımı mevcut sıralamayı korur.","CSV export preserves the current sort order."],
  attentionHint:["Termini yaklaşan veya yüksek öncelikli incelemeler","Reviews due soon or marked high priority"],
  urgent:["Acil aksiyonlar","Urgent actions"], expiredPolicy:["Politika istisnasının süresi doldu","Policy exception has expired"],
  sla:["SLA süresi aşıldı","SLA breached"],
} as const;
