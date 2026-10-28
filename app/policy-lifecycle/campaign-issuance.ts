export type CampaignPerson = { id: string; name: string; email: string; role: string };
export type CampaignIssueInput = { policyId: string; name: string; audience: string; dueDate: string; subjectIds: string[] };
export type CampaignIssuePreview = { revision: string; policy: Record<string, string | number | null>; version: Record<string, string | number | null>; participants: CampaignPerson[]; request: CampaignIssueInput };
export type CampaignPeople = { people: CampaignPerson[]; hasMore: boolean; page: number };
