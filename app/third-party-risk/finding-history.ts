import type { WorkflowEvidence, WorkflowEvidencePin } from '../workflow-selection';

export type FindingHistoryRow = {
  id: string; action: string; actor: string; createdAt: string; detail: string;
  from: string | null; to: string | null; note: string;
  pin: WorkflowEvidencePin | null; pinIssue: boolean;
};
export type FindingHistory = {
  finding: { id: string; vendorId: string; assessmentId: string; title: string; owner: string; dueDate: string; status: string; actionNote: string };
  before: string | null; nextCursor: string | null; rows: FindingHistoryRow[];
};
export class FindingHistoryError extends Error {
  constructor(public status: number) { super('TPRM_FINDING_HISTORY_INPUT'); }
}

/** Decode only transitions actually retained by the existing writer. Do not infer missing history. */
export function findingEventDetail(action: string, detail: string) {
  const transitions: Record<string, string[]> = {
    'finding-start': ['open->in-progress'],
    'finding-submit-finding': ['in-progress->verification'],
    'finding-verify-finding': ['verification->closed'],
    'finding-reopen-finding': ['verification->in-progress', 'closed->in-progress'],
  };
  const transition = transitions[action]?.find(value => detail.startsWith(value + '; '));
  if (!transition) return { from: null, to: null, note: detail };
  const [from, to] = transition.split('->');
  return { from, to, note: detail.slice(transition.length + 2) };
}

export function parseFindingEvidence(raw: string): WorkflowEvidence | null {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    for (const key of ['id', 'evidenceId', 'evidenceTitle', 'fileKey', 'fileName', 'contentSha256', 'chainSha256', 'period', 'owner', 'createdAt']) {
      if (typeof value[key] !== 'string' || value[key].length > 4000) return null;
    }
    if (!value.id || !value.evidenceId || !value.fileKey || !value.fileName || !value.evidenceTitle || !Number.isSafeInteger(value.versionNo) || value.versionNo < 1 || !Number.isSafeInteger(value.fileSize) || value.fileSize < 0 || !/^[a-f0-9]{64}$/i.test(value.contentSha256) || !/^[a-f0-9]{64}$/i.test(value.chainSha256) || !Number.isFinite(Date.parse(value.createdAt))) return null;
    return { id:value.id, evidenceId:value.evidenceId, versionNo:value.versionNo, evidenceTitle:value.evidenceTitle, fileKey:value.fileKey, fileName:value.fileName, fileSize:value.fileSize, contentSha256:value.contentSha256, chainSha256:value.chainSha256, period:value.period, owner:value.owner, createdAt:value.createdAt };
  } catch { return null; }
}

export function findingStatusLabel(status: string, tr: boolean) {
  const labels: Record<string, [string,string]> = { open:['Açık','Open'], 'in-progress':['İyileştirmede','In progress'], verification:['Doğrulamada','In verification'], closed:['Kapalı','Closed'] };
  return labels[status]?.[tr ? 0 : 1] || status;
}
export function findingEventLabel(row: Pick<FindingHistoryRow, 'action' | 'from'>, tr: boolean) {
  const labels: Record<string, [string,string]> = {
    'finding-create':['Bulgu oluşturuldu','Finding created'], 'finding-start':['İyileştirme başlatıldı','Remediation started'],
    'finding-submit-finding':['Doğrulamaya gönderildi','Submitted for verification'], 'finding-verify-finding':['Bağımsız doğrulama ile kapatıldı','Closed after independent verification'],
    'finding-reopen-finding':row.from === 'verification' ? ['Düzeltme için iade edildi','Returned for correction'] : row.from === 'closed' ? ['Yeniden açıldı','Reopened'] : ['İade / yeniden açma','Return / reopen'],
  };
  return labels[row.action]?.[tr ? 0 : 1] || row.action;
}
