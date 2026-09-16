import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {nextReviewDate,policyAttention,validateCampaign,validateException,validatePolicy,validatePolicyAction,validatePolicyVersion} from "../app/policy-lifecycle/domain";

const policy={code:"POL-SEC-001",title:"Information Security Policy",category:"security",classification:"internal",owner:"owner@example.com",reviewer:"reviewer@example.com",audience:"All employees and contractors",reviewFrequencyDays:365};

test("policy register enforces classification, cadence and independent ownership",()=>{
 const value=validatePolicy(policy);assert.equal(value.code,"POL-SEC-001");assert.equal(value.reviewFrequencyDays,365);
 assert.throws(()=>validatePolicy({...policy,reviewer:"owner@example.com"}),/farklı/);
 assert.throws(()=>validatePolicy({...policy,reviewFrequencyDays:10}),/30-1095/);
 assert.throws(()=>validatePolicy({...policy,classification:"secret"}),/geçersiz/);
});

test("policy versions require durable content and GRC mappings",()=>{
 const input={policyId:"POL-1",summary:"Annual control and ownership refresh",content:"This policy defines mandatory information security governance, accountability, monitoring, exceptions and annual review requirements for the organization.",effectiveDate:"2027-02-01",controlRefs:["ISO27001-A.5.1"],regulationRefs:[],riskRefs:["RISK-12"]};
 const value=validatePolicyVersion(input);assert.deepEqual(value.controlRefs,["ISO27001-A.5.1"]);assert.equal(value.riskRefs[0],"RISK-12");
 assert.throws(()=>validatePolicyVersion({...input,controlRefs:[],riskRefs:[]}),/eşlemesi/);
 assert.throws(()=>validatePolicyVersion({...input,content:"short"}),/80 karakter/);
});

test("critical transitions and timed exceptions fail closed",()=>{
 assert.throws(()=>validatePolicyAction({operation:"publish",note:"Approved release",confirmation:"POLİTİKAYI YAYINLA",evidenceReference:"EVD-1",evidenceSha256:"bad"}),/SHA-256/);
 assert.equal(validatePolicyAction({operation:"approve",note:"Independently reviewed",confirmation:"POLİTİKAYI ONAYLA",evidenceReference:"EVD-2",evidenceSha256:"a".repeat(64)}).operation,"approve");
 const exception=validateException({policyId:"POL-1",versionId:"PV-1",scope:"Temporary legacy application",rationale:"Migration is contractually delayed",compensatingControl:"Daily access review and weekly security monitoring",owner:"exception@example.com",reviewer:"reviewer@example.com",expiresAt:"2027-06-01"},"2027-01-01");assert.equal(exception.expiresAt,"2027-06-01");
 assert.throws(()=>validateException({...exception,expiresAt:"2028-01-01"},"2027-01-01"),/1-180/);
});

test("attestation bounds and review priority are deterministic",()=>{
 const campaign=validateCampaign({policyId:"POL-1",versionId:"PV-1",name:"Annual employee acceptance",audience:"Employees",dueDate:"2027-02-28",subjects:["a@example.com","a@example.com","b@example.com"]},"2027-01-01");assert.deepEqual(campaign.subjects,["a@example.com","b@example.com"]);
 assert.equal(nextReviewDate("2027-02-01",365),"2028-02-01");const now=new Date("2027-01-15T12:00:00.000Z");assert.equal(policyAttention("published","2027-01-01",0,0,now),"review-overdue");assert.equal(policyAttention("published","2027-02-01",0,0,now),"review-due");assert.equal(policyAttention("published","2027-12-01",1,0,now),"active-exception");
});

test("enterprise policy lifecycle is wired through schema, API, UI, navigation and docs",async()=>{
 const[route,migration,schema,ui,page,readme,docs]=await Promise.all([readFile("app/api/policy-lifecycle/route.ts","utf8"),readFile("drizzle/0070_policy_lifecycle_management.sql","utf8"),readFile("db/schema.ts","utf8"),readFile("app/policy-lifecycle.tsx","utf8"),readFile("app/page.tsx","utf8"),readFile("README.md","utf8"),readFile("docs/POLICY-LIFECYCLE-MANAGEMENT.md","utf8")]);
 assert.match(route,/Maker-checker: sürümü oluşturan\/gönderen kişi karar veremez/);assert.match(route,/Attestation yalnız atanmış kullanıcı/);assert.match(route,/formula-safe records/);assert.match(route,/Aktif istisna veya açık attestation kampanyası/);assert.match(route,/content_sha256/);
 assert.match(migration,/policy_versions_policy_number_idx/);assert.match(migration,/policy_attestations_campaign_subject_idx/);assert.match(migration,/policy_events/);
 assert.match(schema,/policyDocuments/);assert.match(schema,/policyAttestationCampaigns/);assert.match(schema,/policyExceptions/);
 assert.match(ui,/ENTERPRISE POLICY LIFECYCLE/);assert.match(ui,/Attestation kampanyası/);assert.match(page,/PolicyLifecycle/);assert.match(readme,/Enterprise Policy Lifecycle Management/);assert.match(docs,/fail-closed/);
});
