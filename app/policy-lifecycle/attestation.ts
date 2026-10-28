export type AttestationRow = Record<string, string | number | null>;
export type AttestationSource = { attestation: AttestationRow; campaign: AttestationRow; policy: AttestationRow; version: AttestationRow; revision: string; contentVerified: boolean };
export type AttestationReceipt = { id: string; actor: string; respondedAt: string; decision: string; note: string; contentSha256: string; snapshot: AttestationSource | null };
export type AttestationWorkspace = AttestationSource & { canRespond: boolean; receipt: AttestationReceipt | null; previousVersion: boolean };
export const attestationPhrase = (decision: string) => decision === 'attested' ? 'OKUDUM VE KABUL EDİYORUM' : 'KABUL ETMİYORUM';
