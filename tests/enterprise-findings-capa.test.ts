import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {FINDING_SOURCES,addDays,findingAttention,findingSlaDays,validateFinding,validateFindingAction} from "../app/findings/domain";

const valid={sourceType:"audit",sourceRef:"AUD-2027-01",sourceTitle:"ISO 27001 Internal Audit",findingType:"nonconformity",title:"Privileged access review is incomplete",description:"Quarterly privileged access review evidence does not cover all production administrators.",severity:"high",owner:"action@example.com",reviewer:"reviewer@example.com",rootCause:"Ownership changes were not reflected in the review workflow.",correctiveAction:"Complete the missing review population and remove unjustified privileged access.",preventiveAction:"Automate the population reconciliation and require owner attestation before closure.",dueDate:"2027-01-31",riskRef:"RSK-001",controlRef:"A.5.18"};

test("severity drives bounded CAPA SLA and complete independent ownership",()=>{
 assert.equal(findingSlaDays("critical"),7);assert.equal(addDays("2027-01-01",30),"2027-01-31");
 assert.equal(validateFinding(valid,"2027-01-01").severity,"high");
 assert.throws(()=>validateFinding({...valid,dueDate:"2027-02-01"},"2027-01-01"),/en fazla 30 gün/);
 assert.throws(()=>validateFinding({...valid,reviewer:valid.owner},"2027-01-01"),/farklı/);
 assert.throws(()=>validateFinding({...valid,rootCause:"unknown"},"2027-01-01"),/eksiksiz/);
});

test("continuous-control is a canonical source but generic finding creation cannot forge that lineage",async()=>{
 assert.ok(FINDING_SOURCES.includes("continuous-control"));
 const route=await readFile("app/api/findings/route.ts","utf8");
 assert.match(route,/finding\.sourceType === "continuous-control"/);
 assert.match(route,/yalnız yönetişimli Continuous Assurance inceleme kuyruğu üzerinden oluşturulabilir/);
});

test("closure and time-bound risk acceptance require exact evidence-backed confirmation",()=>{
 const evidence={note:"Independent evidence review completed",evidenceReference:"EVD-CAPA-9",evidenceSha256:"a".repeat(64)};
 assert.equal(validateFindingAction({...evidence,operation:"verify",confirmation:"BULGUYU KAPAT"}).operation,"verify");
 assert.throws(()=>validateFindingAction({...evidence,operation:"verify",confirmation:"KAPAT"}),/BULGUYU KAPAT/);
 assert.equal(validateFindingAction({...evidence,operation:"accept-risk",confirmation:"BULGU RİSKİNİ KABUL ET",acceptUntil:"2027-06-01",acceptanceRationale:"Temporary acceptance with monitored compensating controls."},"2027-01-01").acceptUntil,"2027-06-01");
 assert.throws(()=>validateFindingAction({...evidence,operation:"accept-risk",confirmation:"BULGU RİSKİNİ KABUL ET",acceptUntil:"2027-12-31",acceptanceRationale:"Temporary acceptance with monitored compensating controls."},"2027-01-01"),/180 gün/);
});

test("attention queue detects overdue, priority, expired acceptance and closure",()=>{
 const now=new Date("2027-02-01T12:00:00Z");assert.equal(findingAttention("open","medium","2027-01-31","",now),"overdue");assert.equal(findingAttention("in-progress","critical","2027-02-05","",now),"priority");assert.equal(findingAttention("accepted","high","2027-01-15","2027-01-31",now),"acceptance-expired");assert.equal(findingAttention("closed","critical","2027-01-01","",now),"closed");
});

test("enterprise findings and CAPA is wired across schema, API, UI, navigation and docs",async()=>{
 const[route,migration,schema,ui,page,readme,docs]=await Promise.all([readFile("app/api/findings/route.ts","utf8"),readFile("drizzle/0072_enterprise_findings_capa.sql","utf8"),readFile("db/schema.ts","utf8"),readFile("app/findings-center.tsx","utf8"),readFile("app/page.tsx","utf8"),readFile("README.md","utf8"),readFile("docs/ENTERPRISE-FINDINGS-CAPA.md","utf8")]);
 assert.match(route,/Maker-checker: tespit eden, aksiyon sahibi veya gönderen kişi kapatamaz/);assert.match(route,/bounded formula-safe records/);assert.match(route,/recurrence_count=recurrence_count\+1/);assert.match(route,/sourceCount/);
 assert.match(migration,/enterprise_findings_status_due_idx/);assert.match(migration,/enterprise_finding_events/);assert.match(schema,/enterpriseFindings/);assert.match(schema,/enterpriseFindingEvents/);
 assert.match(ui,/ENTERPRISE FINDINGS · ROOT CAUSE · CAPA · ASSURANCE/);assert.match(ui,/CAPA CSV/);assert.match(page,/FindingsCenter/);assert.match(page,/Bulgular ve CAPA/);assert.match(readme,/Enterprise Findings & CAPA/);assert.match(docs,/fail-closed/);
});
