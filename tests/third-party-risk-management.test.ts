import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {TPRM_CONTROLS,thirdPartyAttention,validateAssessment,validateEvidenceAction,validateFinding,validateThirdParty} from "../app/third-party-risk/domain";

const party={name:"Critical Cloud Provider",service:"Identity platform",legalEntity:"Provider Europe Ltd",category:"SaaS",criticality:"critical",dataClassification:"confidential",dataAccess:"Employee identity and access metadata",hostingLocation:"EU / Türkiye",businessOwner:"business@example.com",riskOwner:"risk@example.com",reviewer:"reviewer@example.com",contact:"vendor@example.com",contractEnd:"2027-12-31",nextReview:"2027-06-30",exitPlan:"Export all records, verify deletion and migrate the service to the approved alternative."};

test("third-party onboarding enforces independent ownership and lifecycle dates",()=>{
 const value=validateThirdParty(party,"2027-01-01");
 assert.equal(value.reviewer,"reviewer@example.com");
 assert.throws(()=>validateThirdParty({...party,reviewer:"risk@example.com"},"2027-01-01"),/farklı/);
 assert.throws(()=>validateThirdParty({...party,nextReview:"2028-01-01"},"2027-01-01"),/sözleşme bitişi/);
 assert.throws(()=>validateThirdParty({...party,dataClassification:"secret"},"2027-01-01"),/geçersiz/);
});

test("due diligence produces deterministic residual risk and critical gaps",()=>{
 const weak=validateAssessment({vendorId:"VEN-1",impact:4,likelihood:3,controlMaturity:1,treatmentPlan:"Close every critical contractual and technical control gap.",...Object.fromEntries(TPRM_CONTROLS.map(x=>[x,false]))});
 assert.equal(weak.inherentScore,12);assert.equal(weak.residualScore,12);assert.equal(weak.riskTier,"high");assert.deepEqual(weak.criticalGaps,["incidentNotification","dataDeletion","auditRights","dpa"]);
 const strong=validateAssessment({vendorId:"VEN-1",impact:4,likelihood:3,controlMaturity:5,treatmentPlan:"Maintain continuous assurance and annual independent review.",...Object.fromEntries(TPRM_CONTROLS.map(x=>[x,true]))});
 assert.equal(strong.coverage,100);assert.equal(strong.residualScore,3);assert.equal(strong.riskTier,"low");assert.deepEqual(strong.criticalGaps,[]);
});

test("CAPA evidence and attention states fail closed",()=>{
 assert.throws(()=>validateFinding({assessmentId:"TPA-1",title:"Weak SLA",severity:"high",description:"Incident SLA is not contractually defined.",owner:"owner@example.com",dueDate:"2026-12-31"},"2027-01-01"),/geçmişte/);
 assert.throws(()=>validateEvidenceAction({operation:"approve",note:"Reviewed",confirmation:"TEDARİKÇİYİ ONAYLA",evidenceReference:"EVD-1",evidenceSha256:"bad"}),/SHA-256/);
 assert.equal(validateEvidenceAction({operation:"verify-finding",note:"CAPA independently verified",confirmation:"BULGUYU KAPAT",evidenceReference:"EVD-2",evidenceSha256:"a".repeat(64)}).operation,"verify-finding");
 const now=new Date("2027-01-15T12:00:00.000Z");assert.equal(thirdPartyAttention("approved","2027-01-01","2027-12-31",0,now),"review-overdue");assert.equal(thirdPartyAttention("approved","2027-06-01","2027-12-31",1,now),"critical-finding");assert.equal(thirdPartyAttention("approved","2027-06-01","2026-12-31",0,now),"contract-expired");
});

test("TPRM 2.0 is integrated across schema, API, UI, navigation and documentation",async()=>{
 const[route,migration,schema,ui,page,readme,docs]=await Promise.all([readFile("app/api/third-party-risk/route.ts","utf8"),readFile("drizzle/0069_third_party_risk_management.sql","utf8"),readFile("db/schema.ts","utf8"),readFile("app/third-party-risk.tsx","utf8"),readFile("app/page.tsx","utf8"),readFile("README.md","utf8"),readFile("docs/THIRD-PARTY-RISK-MANAGEMENT.md","utf8")]);
 assert.match(route,/Açık yüksek\/kritik bulgu veya kritik kontrol boşluğu tam onayı engeller/);assert.match(route,/Karar yalnız atanmış bağımsız reviewer/);assert.match(route,/third-party-export/);assert.match(route,/formula-safe records/);assert.match(route,/Bulguyu oluşturan\/gönderen kişi kapatamaz/);
 assert.match(migration,/third_party_assessment_cycle_idx/);assert.match(migration,/third_party_events/);assert.match(migration,/verification_evidence_sha256/);
 assert.match(schema,/thirdPartyProfiles/);assert.match(schema,/thirdPartyAssessments/);assert.match(schema,/thirdPartyFindings/);
 assert.match(ui,/THIRD-PARTY RISK MANAGEMENT 2\.0/);assert.match(ui,/Bulgular ve CAPA/);assert.match(ui,/12 control domains/);
 assert.match(page,/ThirdPartyRisk/);assert.match(readme,/Third-Party Risk Management 2\.0/);assert.match(docs,/fail-closed/);
});
