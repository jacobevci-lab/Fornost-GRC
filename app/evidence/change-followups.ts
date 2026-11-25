import { AuditRequestError } from '../audit-requests';
import type { UsagePin } from './usage';

export type EvidenceChangeSource = 'requests' | 'workpapers';
export type EvidenceChangeOrigin = {
  version: 1; key: string; inputHash: string;
  evidence: { id: string; code: string; title: string; versionId: string; versionNo: number; contentSha256: string };
  source: { kind: EvidenceChangeSource; id: string; auditId: string; title: string; revision: string; status: string; pins: UsagePin[] };
  reason: string; createdBy: string; createdAt: string;
};
export type EvidenceChangePreview = {
  token: string; canCreate: boolean; eligibility: 'ready' | 'historical' | 'no-current-version' | 'current' | 'existing' | 'read-only';
  evidence: EvidenceChangeOrigin['evidence']; source: EvidenceChangeOrigin['source'];
  auditName: string; sourceOwner: string; sourceDueDate: string; timeZone: string;
  actorEmail: string; admin: boolean; people: {email: string; name: string}[]; peopleComplete: boolean;
  existing: {id: string; title: string; status: string; owner: string; dueDate: string} | null;
};
export function evidenceChangeSource(value: unknown): EvidenceChangeSource {
  if (value !== 'requests' && value !== 'workpapers') throw new AuditRequestError('fields');
  return value;
}
export function validateEvidenceChangeOrigin(value: unknown): EvidenceChangeOrigin {
  const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  const text = (v: unknown, max: number) => typeof v === 'string' && !!v && v.length <= max;
  const v = value as EvidenceChangeOrigin;
  if (!v || v.version !== 1 || !hash(v.key) || !hash(v.inputHash) || !v.evidence || !v.source ||
      !text(v.evidence.id,120) || !text(v.evidence.code,200) || !text(v.evidence.title,500) || !text(v.evidence.versionId,120) || !Number.isInteger(v.evidence.versionNo) || v.evidence.versionNo < 1 || !hash(v.evidence.contentSha256) ||
      !['requests','workpapers'].includes(v.source.kind) || !text(v.source.id,100) || !text(v.source.auditId,100) || !text(v.source.title,500) || !text(v.source.revision,100) || !text(v.source.status,40) ||
      !Array.isArray(v.source.pins) || !v.source.pins.length || v.source.pins.length > 100 || v.source.pins.some(p => !p || typeof p.id !== 'string' || p.id.length > 120 || !Number.isInteger(p.versionNo) || p.versionNo < 0 || !['current','older','unknown'].includes(p.state)) ||
      !text(v.reason,2000) || v.reason.trim().length < 3 || !text(v.createdBy,254) || !text(v.createdAt,50) || !Number.isFinite(Date.parse(v.createdAt))) throw new AuditRequestError('source-invalid',503);
  return v;
}
/** Audit-only readers retain the task and its history, without evidence provenance. */
export function milestoneHistoryForAccess<T extends {snapshot_json: unknown}>(event: T, evidenceAccess: boolean): T {
  if (evidenceAccess) return event;
  const snapshot = JSON.parse(String(event.snapshot_json));
  delete snapshot.evidenceChangeOrigin;
  return {...event,snapshot_json:JSON.stringify(snapshot)};
}
