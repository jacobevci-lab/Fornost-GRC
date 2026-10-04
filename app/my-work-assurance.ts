import { buildControlAssurance, type AssuranceRow } from './control-assurance';
import { buildAuditEvidenceAssurance } from './audit-evidence-assurance';
import { evaluateEvidenceEligibility } from './evidence/eligibility';
import { findingAttention } from './findings/domain';
import { matchesWorkIdentity, findingWorkDisposition } from './work-queue';
import type { ControlAssuranceSnapshot } from './control-assurance-state';

export type WorkIdentity = { name?: string; email?: string; role?: string };
export type AssuranceAction = { row: AssuranceRow; group: 'control' | 'audit' | 'evidence' | 'finding'; critical: boolean; reasons: string[] };
const text = (value: unknown) => String(value ?? '').trim();
const key = (value: unknown) => text(value).normalize('NFKC').toLocaleLowerCase('tr-TR');

export function validWorkAssuranceSnapshot(value: unknown): value is ControlAssuranceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const body = value as ControlAssuranceSnapshot;
  return Array.isArray(body.rows) && body.rows.every(row => row && typeof row.id === 'string' && !!row.id && typeof row.module === 'string' && row.data && typeof row.data === 'object' && !Array.isArray(row.data))
    && Array.isArray(body.issues) && body.issues.every(issue => typeof issue === 'string')
    && typeof body.verified === 'boolean' && (!body.verified || body.issues.length === 0)
    && typeof body.generatedAt === 'string' && Number.isFinite(Date.parse(body.generatedAt));
}

/** Same evaluated sources and time as Control Library; scope is presentation, not authorization. */
export function buildWorkAssuranceActions(snapshot: ControlAssuranceSnapshot, user: WorkIdentity, scope: 'mine' | 'organization'): AssuranceAction[] {
  if (!snapshot.verified || snapshot.issues.length || (!user.email && !user.name)) return [];
  const now = new Date(snapshot.generatedAt);
  const assigned = (values: unknown[]) => scope === 'organization' && user.role === 'Admin' || matchesWorkIdentity(values.map(text), user);
  const actions: AssuranceAction[] = [];
  const evidence = snapshot.rows.filter(row => row.module === 'Kanıtlar');
  for (const item of buildControlAssurance(snapshot.rows, snapshot.generatedAt).items) {
    if (item.state === 'critical' && assigned([item.owner, item.control.data.ownerEmail, item.control.data.testOwner])) {
      actions.push({ row: item.control, group: 'control', critical: true, reasons: item.reasons });
    }
  }
  for (const row of snapshot.rows) {
    if (row.module === 'Denetim Yönetimi' && assigned([row.data.owner, row.data.ownerEmail, row.data.auditOwner])) {
      const assessment = buildAuditEvidenceAssurance([row], evidence, now);
      if (!assessment.total || assessment.gaps.length) actions.push({ row, group: 'audit', critical: !assessment.total || !!assessment.missing.length,
        reasons: [!assessment.total ? 'audit-unmapped' : assessment.missing.length ? 'evidence-missing' : 'evidence-stale'] });
    }
    if (row.module === 'Kanıtlar' && assigned([row.data.owner, row.data.ownerEmail, row.data.evidenceOwner])) {
      const eligibility = evaluateEvidenceEligibility(row.data, now);
      if (!eligibility.current) actions.push({ row, group: 'evidence', critical: key(row.data.evidenceIntegrity) === 'broken',
        reasons: [key(row.data.evidenceIntegrity) === 'broken' ? 'evidence-integrity-broken' : eligibility.expired || eligibility.invalid ? 'evidence-stale' : 'evidence-review'] });
    }
    if (row.module === 'Bulgular ve CAPA' && ['finding', 'finding-manual'].includes(text(row.data.kind)) && assigned([row.data.owner, row.data.reviewer])) {
      const attention = findingAttention(text(row.data.status), text(row.data.severity), text(row.data.dueDate), text(row.data.acceptUntil), now);
      const disposition = findingWorkDisposition(row.data, now.getTime());
      if (!['closed', 'accepted'].includes(disposition)) actions.push({ row, group: 'finding', critical: ['overdue', 'acceptance-expired'].includes(attention) || key(row.data.severity) === 'critical', reasons: [disposition === 'acceptance-review' ? 'acceptance-review' : disposition === 'acceptance-expired' ? 'acceptance-expired' : 'open-findings'] });
    }
  }
  return actions.sort((a, b) => Number(b.critical) - Number(a.critical) || a.row.id.localeCompare(b.row.id));
}
