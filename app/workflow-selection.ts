export type WorkflowEvidence = {
  id: string; evidenceId: string; versionNo: number; evidenceTitle: string;
  fileKey: string; fileName: string; fileSize: number; contentSha256: string;
  chainSha256: string; period: string; owner: string; createdAt: string;
};
export type WorkflowEvidencePin = {
  id: string; eventId: string; entityId: string; purpose: string;
  evidence: WorkflowEvidence; actor: string; createdAt: string;
};
export type WorkflowPerson = {id: string; name: string; email: string; role: string};
export type WorkflowSelection = {evidenceId: string; versionId: string};
export type WorkflowGuard = {sql: string; values: unknown[]};
