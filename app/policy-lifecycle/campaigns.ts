export type PolicyCampaign = {
  id: string; policyId: string; versionId: string; name: string; audience: string; dueDate: string;
  requiredCount: number; status: string; attestedCount: number; declinedCount: number; pendingCount: number;
};
export type CampaignRecipient = { id: string; email: string; status: string; note: string; respondedAt: string; contentSha256: string };
export type CampaignClosure = {
  schema: 1; requestId: string; sourceRevision: string; actorId: string; actor: string; closedAt: string; note: string;
  acknowledgedOutstanding: boolean; counts: { attested: number; declined: number; pending: number; total: number };
  versionId: string; versionNumber: number; contentSha256: string;
};
export type CampaignWorkspace = {
  campaign: PolicyCampaign & { closedBy: string; closedAt: string };
  version: { id: string; number: number; content: string; contentSha256: string; status: string; policyCode: string; policyTitle: string };
  recipients: CampaignRecipient[]; complete: boolean; revision: string; closure: CampaignClosure | null;
};
