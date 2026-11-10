export const workNames = {
  first: ["İlk sürümü hazırla", "Prepare first version"],
  draft: ["Taslağı incelemeye gönder", "Submit draft for review"],
  review: ["Bağımsız sürüm incelemesi", "Independent version review"],
  approved: ["Onaylı sürümü yayımla", "Publish approved version"],
  periodic: ["Periyodik inceleme", "Periodic review"],
  exceptionDraft: ["İstisna talebini gönder", "Submit exception request"],
  exceptionReview: ["İstisna talebini incele", "Review exception request"],
  expiry: ["İstisna bitişini incele", "Review exception expiry"],
  response: ["Atanan sürümü oku", "Read assigned version"],
  campaign: ["Kampanya sonuçlarını incele", "Review campaign outcomes"],
} as const;

export type PolicyWorkKind = keyof typeof workNames;
export type PolicyWorkItem = {
  kind: PolicyWorkKind; id:string; policyId:string; code:string; title:string;
  versionNumber:number|null; responsible:string; due:string|null; detail:string;
};
export type PolicyWorkPage = {
  rows:PolicyWorkItem[]; page:number; pages:number; total:number; openCampaigns:number; pendingResponses:number;
};
