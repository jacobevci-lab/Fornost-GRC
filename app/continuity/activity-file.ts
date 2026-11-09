import type {WorkflowEvidencePin} from "../workflow-selection";

export type ContinuityExercise = {
  id:string; code:string; planId:string; type:string; scheduledDate:string; scenario:string; facilitator:string;
  status:string; outcome?:string; rtoBreached:boolean; rpoBreached:boolean; actualRecoveryHours:number|null;
  actualDataLossHours:number|null; createdAt:string; completedAt?:string; completedBy?:string;
};
export type ContinuityGap = {
  id:string; planId:string; severity:string; title:string; owner:string; reviewer:string;
  dueDate:string; status:string; createdAt:string; exerciseId:string; retestExerciseId?:string;
};
export type VerificationExercise = {id:string;code:string;scheduledDate:string};
export type ContinuityActivityFile = {
  plan:{id:string;code:string;name:string;status:string;rtoHours:number;rpoHours:number}|null;
  source:(Pick<ContinuityExercise,"id"|"code"|"scenario"|"status"|"actualRecoveryHours"|"actualDataLossHours"|"scheduledDate"> & {evidenceReference:string|null})|null;
  gaps:{id:string;title:string;status:string}[];
  verification:VerificationExercise|null;
  candidates:VerificationExercise[];
  closureEvidenceReference:string|null;
  pins:WorkflowEvidencePin[];
};
