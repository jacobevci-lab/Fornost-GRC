import { validReviewDate } from './review-schedule';

export type ContractExtension = { previousDate: string; nextDate: string };
export type ContractExtensionRecord = ContractExtension & { reviewDate: string; note: string };
export class ContractExtensionError extends Error {
  constructor(public code: 'TPRM_CONTRACT_INPUT' | 'TPRM_CONTRACT_SOURCE_CHANGED' | 'TPRM_CONTRACT_ACCESS', public status = 400) { super(code); }
}
export function validContractExtension(next: unknown, previous: unknown, today = new Date().toISOString().slice(0, 10)): next is string {
  return validReviewDate(previous) && validReviewDate(next) && next > previous && next > today;
}
export function canExtendContract(profile: { status: unknown; reviewer?: unknown; createdBy?: unknown; businessOwner?: unknown; riskOwner?: unknown }, actor: { role: string; email: string }) {
  const email = actor.email.toLowerCase();
  return [profile.reviewer,profile.createdBy,profile.businessOwner,profile.riskOwner].every(value=>typeof value==='string'&&value.length>0) && actor.role === 'Admin' && !['unmanaged','offboarded','rejected'].includes(String(profile.status)) && String(profile.reviewer).toLowerCase() === email && ![profile.createdBy,profile.businessOwner,profile.riskOwner].some(value => String(value).toLowerCase() === email);
}
export function validateContractExtension(input: Record<string, unknown>, profile: { contract_end: unknown; updated_at: unknown }) {
  const value = input.contractExtension as Record<string, unknown> | null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'nextDate,previousDate' || !validContractExtension(value.nextDate,value.previousDate) || typeof input.expectedRevision !== 'string' || !input.expectedRevision || input.confirmation !== 'SÖZLEŞME UZATIMINI KAYDET' || typeof input.note !== 'string' || input.note.trim().length < 20 || input.note.trim().length > 1200 || input.note.includes('\u0000')) throw new ContractExtensionError('TPRM_CONTRACT_INPUT');
  if (input.expectedRevision !== profile.updated_at || value.previousDate !== profile.contract_end) throw new ContractExtensionError('TPRM_CONTRACT_SOURCE_CHANGED',409);
  return { previousDate: value.previousDate as string, nextDate: value.nextDate, note: input.note.trim() };
}
export function parseContractExtensionRecord(value: unknown): ContractExtensionRecord | null {
  try {
    const detail = JSON.parse(String(value));
    if (detail.schema !== 'tprm-contract-extension-v1' || !validReviewDate(detail.previousDate) || !validReviewDate(detail.nextDate) || detail.nextDate <= detail.previousDate || !validReviewDate(detail.reviewDate) || typeof detail.note !== 'string') return null;
    return { previousDate: detail.previousDate, nextDate: detail.nextDate, reviewDate: detail.reviewDate, note: detail.note };
  } catch { return null; }
}
