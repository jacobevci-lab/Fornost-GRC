import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {appetiteAttention,canonicalJson,classifyKri,nextMeasurementDate,validateBreachPlan,validateKriMeasurement,validateRiskAction,validateRiskAppetite,validateRiskScenario} from "../app/risk-appetite/domain";

const upper={code:"RA-CYB-001",category:"cyber",statement:"Material cyber exposure must remain within the board-approved tolerance throughout the year.",kriName:"Critical vulnerabilities past SLA",metricUnit:"count",direction:"upper",appetiteTarget:0,warningThreshold:3,breachThreshold:6,owner:"risk@example.com",reviewer:"reviewer@example.com",frequencyDays:30,validFrom:"2027-01-01",validUntil:"2027-12-31"};

test("risk appetite validates upper and lower threshold direction with independent ownership",()=>{
 const value=validateRiskAppetite(upper,"2027-01-01");assert.equal(value.breachThreshold,6);
 assert.throws(()=>validateRiskAppetite({...upper,warningThreshold:7},"2027-01-01"),/iştah ≤ uyarı < ihlal/);
 assert.equal(validateRiskAppetite({...upper,code:"RA-RES-001",direction:"lower",appetiteTarget:99.9,warningThreshold:99,breachThreshold:97},"2027-01-01").direction,"lower");
 assert.throws(()=>validateRiskAppetite({...upper,reviewer:"risk@example.com"},"2027-01-01"),/farklı/);
});

test("KRI classification is deterministic in both directions",()=>{
 assert.equal(classifyKri(2,"upper",3,6),"green");assert.equal(classifyKri(3,"upper",3,6),"amber");assert.equal(classifyKri(6,"upper",3,6),"red");
 assert.equal(classifyKri(99.5,"lower",99,97),"green");assert.equal(classifyKri(98,"lower",99,97),"amber");assert.equal(classifyKri(97,"lower",99,97),"red");
 assert.equal(nextMeasurementDate("2027-01-31",30),"2027-03-02");
});

test("KRI measurement and breach response require durable evidence and dates",()=>{
 const value=validateKriMeasurement({appetiteId:"RAP-1",periodStart:"2027-01-01",periodEnd:"2027-01-31",value:8,sourceRef:"Nessus monthly export EVD-9",evidenceSha256:"a".repeat(64),note:"Validated critical findings outside remediation SLA."},"2027-02-01");assert.equal(value.value,8);
 assert.throws(()=>validateKriMeasurement({...value,evidenceSha256:"bad"},"2027-02-01"),/SHA-256/);assert.throws(()=>validateKriMeasurement({...value,periodEnd:"2027-02-02"},"2027-02-01"),/Geçmiş\/geçerli/);
 assert.equal(validateBreachPlan({responseOwner:"action@example.com",responsePlan:"Patch affected systems and verify closure through a clean authenticated rescan.",dueDate:"2027-02-15"},"2027-02-01").dueDate,"2027-02-15");
 assert.throws(()=>validateBreachPlan({responseOwner:"action@example.com",responsePlan:"Too short",dueDate:"2027-01-01"},"2027-02-01"),/20 karakter/);
});

test("risk scenarios, exact confirmations and attention queue fail closed",()=>{
 const scenario=validateRiskScenario({appetiteId:"RAP-1",name:"Ransomware stress",horizonDays:90,baselineValue:2,stressedValue:12,forecastValue:7,confidence:75,assumptions:"Attack surface and threat frequency remain at the current elevated level.",treatmentPlan:"Accelerate exposure closure and exercise isolated recovery for critical services.",owner:"owner@example.com",reviewer:"reviewer@example.com",dueDate:"2027-03-01"},"2027-01-01");assert.equal(scenario.confidence,75);
 assert.throws(()=>validateRiskAction({operation:"close-breach",note:"Verified closure",confirmation:"İHLALİ KAPAT",evidenceReference:"EVD-2",evidenceSha256:"bad"}),/SHA-256/);
 assert.equal(validateRiskAction({operation:"approve",note:"Independent board mandate review",confirmation:"RİSK İŞTAHINI ONAYLA",evidenceReference:"EVD-3",evidenceSha256:"b".repeat(64)}).operation,"approve");
 const now=new Date("2027-01-15T12:00:00Z");assert.equal(appetiteAttention("approved","2027-02-01","red",0,now),"breached");assert.equal(appetiteAttention("approved","2027-01-01","green",0,now),"measurement-overdue");
});

test("canonical board snapshot is order independent and tamper evident",()=>{
 const first=canonicalJson({period:"2027-01",summary:{breaches:2,risks:4},items:[{id:"A",score:12}]});const second=canonicalJson({items:[{score:12,id:"A"}],summary:{risks:4,breaches:2},period:"2027-01"});assert.equal(first,second);assert.notEqual(first,canonicalJson({period:"2027-01",summary:{breaches:3,risks:4},items:[{id:"A",score:12}]}));assert.deepEqual(JSON.parse(canonicalJson({missing:undefined})),{missing:null});
});

test("enterprise risk appetite and KRI is wired across schema, API, UI, navigation and docs",async()=>{
 const[route,migration,schema,ui,page,readme,docs]=await Promise.all([readFile("app/api/risk-appetite/route.ts","utf8"),readFile("drizzle/0071_enterprise_risk_appetite_kri.sql","utf8"),readFile("db/schema.ts","utf8"),readFile("app/risk-appetite.tsx","utf8"),readFile("app/page.tsx","utf8"),readFile("README.md","utf8"),readFile("docs/ENTERPRISE-RISK-APPETITE-KRI.md","utf8")]);
 assert.match(route,/KRI ölçümü kaydedildi ve ihlal otomatik açıldı/);assert.match(route,/Maker-checker: ölçen, aksiyon sahibi veya gönderen ihlali kapatamaz/);assert.match(route,/Paket bütünlük doğrulaması başarısız/);assert.match(route,/formula-safe records/);assert.match(route,/bounded live portfolio/);
 assert.match(migration,/risk_kri_period_idx/);assert.match(migration,/risk_board_snapshots/);assert.match(migration,/risk_appetite_events/);assert.match(schema,/riskAppetiteStatements/);assert.match(schema,/riskKriBreaches/);assert.match(schema,/riskBoardSnapshots/);
 assert.match(ui,/ENTERPRISE RISK APPETITE · KRI · BOARD OVERSIGHT/);assert.match(ui,/Mühürlü yönetim kurulu paketi/);assert.match(page,/RiskAppetite/);assert.match(readme,/Enterprise Risk Appetite & KRI/);assert.match(docs,/fail-closed/);
});
