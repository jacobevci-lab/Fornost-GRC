import assert from "node:assert/strict";
import test from "node:test";
import {buildAuditReadinessReportCsv,buildAuditReadinessReportHtml,type AuditReadinessSnapshot} from "../app/audit-readiness-export";

const snapshot:AuditReadinessSnapshot={
  auditName:"ISO 27001 <Q3>",
  generatedAt:"2026-09-26T18:00:00.000Z",
  gateLabel:"NOT READY",
  readiness:50,
  coverage:75,
  total:2,
  current:1,
  stale:0,
  missing:1,
  requirements:[
    {reference:"A.5.1",title:"Policies",owner:"CISO",dueDate:"2026-10-01",status:"current",linkedEvidence:2,currentEvidence:2,staleEvidence:0},
    {reference:"A.8.8",title:"Technical vulnerabilities",owner:"SecOps",dueDate:"2026-09-30",status:"missing",linkedEvidence:0,currentEvidence:0,staleEvidence:0},
  ],
  assuranceSignals:[
    {id:"sig-1",state:"failing",title:"Vulnerability SLA",targetControlRef:"A.8.8",owner:"SecOps",dueDate:"2026-09-30",reason:"control-failing",blocking:true},
  ],
};

test("audit readiness HTML snapshot carries evidence and Continuous Assurance context",()=>{
  const report=buildAuditReadinessReportHtml(snapshot);
  assert.match(report,/Fornost GRC · Audit Readiness Snapshot/);
  assert.match(report,/ISO 27001 &lt;Q3&gt;/);
  assert.doesNotMatch(report,/ISO 27001 <Q3>/);
  assert.match(report,/Readiness<\/span><b>50%/);
  assert.match(report,/Coverage<\/span><b>75%/);
  assert.match(report,/Continuous Assurance blockers<\/span><b>1/);
  assert.match(report,/A\.8\.8/);
  assert.match(report,/Vulnerability SLA/);
  assert.match(report,/BLOCKING/);
});

test("audit readiness CSV snapshot exports requirements and live assurance signals",()=>{
  const report=buildAuditReadinessReportCsv(snapshot);
  assert.match(report,/"section","reference","title"/);
  assert.match(report,/"requirement","A\.5\.1","Policies"/);
  assert.match(report,/"continuous-assurance","A\.8\.8","Vulnerability SLA"/);
  assert.match(report,/"control-failing","true"/);
});
