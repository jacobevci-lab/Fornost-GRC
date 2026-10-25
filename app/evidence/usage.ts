import type { FornostNavigationRequest } from '../navigation-focus';

export const usageSources = ['controls', 'requirements', 'requests', 'workpapers', 'findings'] as const;
export type UsageSource = typeof usageSources[number];
export type UsagePin = { id: string; versionNo: number; state: 'current' | 'older' | 'unknown' };
export type EvidenceUsageRow = {
  id: string; source: UsageSource; module: string; title: string; owner: string; status: string;
  dueDate: string; historical: boolean; pins: UsagePin[]; target: FornostNavigationRequest;
};
export type EvidenceUsage = {
  evidence: { id: string; code: string; title: string; versionId: string; versionNo: number; updatedAt: string };
  checkedAt: string; canPlanReview: boolean;
  sources: { key: UsageSource; state: 'complete' | 'limited' | 'unavailable' | 'restricted'; limit: number }[];
  rows: EvidenceUsageRow[];
  unresolvedControls: string[];
};
export class EvidenceUsageError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
const str = (value: unknown) => typeof value === 'string' ? value : '';
// Match complete identities, never substrings or display titles.
export function usageReferences(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap(usageReferences) : str(value).split(/[;,|\r\n]+/).map(v => v.trim().toLowerCase()).filter(Boolean);
}
export function usagePins(raw: unknown, evidence: EvidenceUsage['evidence']): UsagePin[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(p => p && typeof p === 'object' && p.evidenceId === evidence.id).map(p => ({
    id: str(p.id), versionNo: Number(p.versionNo) || 0,
    state: p.available !== 1 ? 'unknown' : p.id === evidence.versionId && p.versionNo === evidence.versionNo ? 'current'
      : evidence.versionId && typeof p.id === 'string' && p.id && Number.isInteger(p.versionNo) && p.versionNo > 0 && p.versionNo < evidence.versionNo ? 'older' : 'unknown',
  }));
}
export const usageNeedsReview = (row: EvidenceUsageRow) => !row.historical && row.pins.some(pin => pin.state === 'older' || pin.state === 'unknown');
