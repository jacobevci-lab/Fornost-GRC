import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {incidentAttention,incidentRecoveryHours,incidentResponseHours,validateIncident,validateIncidentAction} from "../app/incidents/domain";

const base={title:"Production identity compromise",category:"account-compromise",severity:"critical",detectedDate:"2026-09-17",description:"Privileged identity showed confirmed anomalous access activity.",businessImpact:"Production services and restricted records may be affected.",owner:"owner@example.com",commander:"commander@example.com",reviewer:"reviewer@example.com",assetRefs:"AST-001, AST-002",riskRef:"RSK-001",biaRef:"BIA-001",dataClassification:"Restricted",personalData:true};

test("incident declaration enforces complete ownership and classification",()=>{
 const result=validateIncident(base,"2026-09-17");assert.equal(result.severity,"critical");assert.equal(result.personalData,true);
 assert.throws(()=>validateIncident({...base,reviewer:base.owner},"2026-09-17"),/farklı/);
 assert.throws(()=>validateIncident({...base,detectedDate:"2026-09-18"},"2026-09-17"),/gelecekte/);
});

test("incident SLA and attention states are deterministic",()=>{
 assert.deepEqual([incidentResponseHours("critical"),incidentResponseHours("high"),incidentResponseHours("medium"),incidentResponseHours("low")],[1,4,12,24]);
 assert.deepEqual([incidentRecoveryHours("critical"),incidentRecoveryHours("high"),incidentRecoveryHours("medium"),incidentRecoveryHours("low")],[24,72,120,240]);
 assert.equal(incidentAttention("triage","critical","2026-09-16",new Date("2026-09-17T12:00:00Z")),"response-breach");
 assert.equal(incidentAttention("closed","critical","2026-09-01"),"closed");
});

test("evidence, notification decision and lessons learned fail closed",()=>{
 const sha="a".repeat(64);
 assert.equal(validateIncidentAction({operation:"review",note:"Recovery validation completed.",evidenceReference:"EVD-1",evidenceSha256:sha,rootCause:"Compromised credential without phishing-resistant MFA.",lessonsLearned:"Require phishing-resistant MFA and shorten privileged sessions.",notificationDecision:"required",notificationRationale:"Restricted personal data exposure is confirmed and reportable.",confirmation:"OLAYI İNCELEMEYE GÖNDER"}).operation,"review");
 assert.throws(()=>validateIncidentAction({operation:"close",note:"Closure reviewed.",confirmation:"OLAYI KAPAT"}),/SHA-256|Kanıt/);
});

test("enterprise incident center is wired across schema, API, UI and navigation",()=>{
 const migration=readFileSync("drizzle/0073_enterprise_incident_crisis.sql","utf8"),api=readFileSync("app/api/incidents/route.ts","utf8"),ui=readFileSync("app/incident-center.tsx","utf8"),page=readFileSync("app/page.tsx","utf8");
 for(const token of ["enterprise_incidents","enterprise_incident_events"])assert.ok(migration.includes(token));
 for(const token of ["maker-checker","notification_decision","incident-export","reopen_count"])assert.ok(api.toLowerCase().includes(token));
 for(const token of ["Güvenlik Olayları","IncidentCenter","/api/incidents"])assert.ok(`${page}\n${ui}`.includes(token));
});
