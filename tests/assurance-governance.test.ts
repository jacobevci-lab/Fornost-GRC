import assert from "node:assert/strict";
import test from "node:test";
import {applyApprovedResidualRisk,assuranceRiskLevel,exceptionEffectiveStatus,validateAssuranceException,validateRiskReviewProposal} from "../app/assurance-governance";
const sha="a".repeat(64);

test("risk reassessment requires bounded residual ratings and immutable evidence",()=>{
 const proposal=validateRiskReviewProposal({riskId:"RSK-1",residualLikelihood:2,residualImpact:3,rationale:"Verified remediation materially changed the exposure profile.",evidenceReference:"EVD-1",evidenceSha256:sha});
 assert.equal(proposal.residualLikelihood,2);assert.equal(proposal.residualImpact,3);
 assert.throws(()=>validateRiskReviewProposal({riskId:"RSK-1",residualLikelihood:0,residualImpact:6,rationale:"too short",evidenceReference:"",evidenceSha256:""}));
});

test("approved residual decision is explicit and does not rewrite inherent risk",()=>{
 const proposal=validateRiskReviewProposal({riskId:"RSK-1",residualLikelihood:2,residualImpact:3,rationale:"Independent review accepted the documented residual exposure.",evidenceReference:"EVD-2",evidenceSha256:sha});
 const result=applyApprovedResidualRisk({inherentLikelihood:"4",inherentImpact:"5",residualRiskReviewRequired:true},proposal,"reviewer@example.com","2026-09-21T12:00:00.000Z") as Record<string,unknown>;
 assert.equal(result.inherentLikelihood,"4");assert.equal(result.inherentImpact,"5");assert.equal(result.residualScore,"6");assert.equal(result.residualRiskLevel,"Orta");assert.equal(result.residualRiskReviewRequired,false);
 assert.equal(assuranceRiskLevel(16),"Kritik");assert.equal(assuranceRiskLevel(10),"Yüksek");
});

test("assurance exceptions are evidence backed and capped at 180 days",()=>{
 const result=validateAssuranceException({controlRef:"ISO-A.5.1",reason:"Temporary compensating control is documented and independently monitored.",expiresAt:"2026-12-01",evidenceReference:"EVD-X",evidenceSha256:sha},"2026-09-21");
 assert.equal(result.controlRef,"ISO-A.5.1");
 assert.throws(()=>validateAssuranceException({controlRef:"ISO-A.5.1",reason:"Temporary exception beyond policy maximum period.",expiresAt:"2027-09-21",evidenceReference:"EVD-X",evidenceSha256:sha},"2026-09-21"));
});

test("expired active exception becomes expired without claiming effective assurance",()=>{
 assert.equal(exceptionEffectiveStatus("active","2026-09-20","2026-09-21"),"expired");
 assert.equal(exceptionEffectiveStatus("active","2026-09-22","2026-09-21"),"active");
});
