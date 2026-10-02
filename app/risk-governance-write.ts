// Generic register edits cannot manufacture or erase independent decision metadata.
const managed = (key:string) => /^(?:assurance|lastAssurance|riskReview|residualRiskApproved|residualRiskEvidence)/.test(key)
  || ['residualRiskReviewRequired','residualRiskRationale','lastReassessedAt','reassessmentSource','reassessmentReason'].includes(key);
const ratings = ['residualLikelihood','residualImpact','residualScore','residualRiskLevel'];
export function preserveRiskGovernance(input:Record<string,unknown>, existing:Record<string,unknown>={}) {
  const governed=typeof existing.residualRiskReviewRequired==='boolean'||!!existing.residualRiskApprovedAt;
  const protectedKey=(key:string)=>managed(key)||(governed&&ratings.includes(key));
  return {...Object.fromEntries(Object.entries(input).filter(([key])=>!protectedKey(key))),...Object.fromEntries(Object.entries(existing).filter(([key])=>protectedKey(key)))};
}
