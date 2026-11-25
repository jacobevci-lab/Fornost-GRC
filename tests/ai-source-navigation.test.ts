import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {aiRecordNavigation} from "../app/ai/context";

const operational=readFileSync("app/ai/operational-assurance-context.ts","utf8");
const evidence=readFileSync("app/ai/evidence-lineage-context.ts","utf8");
const route=readFileSync("app/api/ai/source-target/route.ts","utf8");
const bridge=readFileSync("app/fornost-ai-source-navigation.tsx","utf8");
const platform=readFileSync("app/platform-experience.tsx","utf8");

test("generic Ask Fornost GRC sources expose exact governed record targets",()=>{
 assert.deepEqual(aiRecordNavigation({id:"risk-db",module:"Risk Assessment"},{riskId:"RSK-101"}),{module:"Risk Assessment",ref:"RSK-101",filterKey:"riskRef"});
 assert.deepEqual(aiRecordNavigation({id:"control-db",module:"Kontroller"},{controlId:"CTRL-7"}),{module:"Kontroller",ref:"CTRL-7",filterKey:"controlRef"});
 assert.deepEqual(aiRecordNavigation({id:"EVD-9",module:"Kanıtlar"},{evidenceId:"EVD-9"}),{module:"Kanıtlar",ref:"EVD-9",filterKey:"evidenceRef"});
 assert.deepEqual(aiRecordNavigation({id:"finding-db",module:"Bulgular ve CAPA"},{findingCode:"FND-3"}),{module:"Bulgular ve CAPA",ref:"FND-3",filterKey:"findingRef"});
 assert.equal(aiRecordNavigation({id:"vendor-db",module:"Tedarikçiler"},{}),undefined);
});

test("operational assurance citations carry safe workflow-specific navigation",()=>{
 assert.match(operational,/navigation\?: OperationalAssuranceNavigation/);
 assert.match(operational,/function exceptionNavigation/);
 assert.match(operational,/module:"Kanıt Otomasyonu",ref:findingRef,filterKey:"findingRef"/);
 assert.match(operational,/function priorityNavigation/);
 assert.match(operational,/item\.kind==="finding"&&findingRef/);
 assert.match(operational,/assuranceEscalationNavigation\(escalation\.kind,parseObject\(escalation\.source_json\)\)/);
 assert.doesNotMatch(operational,/item\.kind === "finding" \? "Bulgular ve CAPA"/);
});

test("evidence lineage citations open the exact evidence record while summary remains informational",()=>{
 assert.match(evidence,/navigation\?: \{module:"Kanıtlar";ref:string;filterKey:"evidenceRef"\}/);
 assert.match(evidence,/navigation:\{module:"Kanıtlar",ref:record\.id,filterKey:"evidenceRef"\}/);
 assert.match(evidence,/EVIDENCE-LINEAGE-SUMMARY/);
});

test("AI source target API resolves governance synthetic citations without bypassing maker-checker semantics",()=>{
 assert.match(route,/requireRole\(req,\["Admin","Editor","Viewer"\]\)/);
 assert.match(route,/CA-RISK-REVIEW-/);
 assert.match(route,/CA-EXCEPTION-/);
 assert.match(route,/CA-ESCALATION-/);
 assert.match(route,/CA-CONTROL-/);
 assert.match(route,/CA-FINDING-/);
 assert.match(route,/CA-WORK-/);
 assert.match(route,/action==="capa-promotion"&&row\.result_ref/);
 assert.match(route,/canonicalFindingCode/);
 assert.match(route,/module:"Kanıt Otomasyonu",ref:finding,filterKey:"findingRef"/);
});

test("Ask Fornost citation bridge is keyboard accessible and reuses the shared focus contract",()=>{
 assert.match(bridge,/\/api\/ai\/source-target\?sourceId=/);
 assert.match(bridge,/navigateToFornost/);
 assert.match(bridge,/source:"ask-fornost-source"/);
 assert.match(bridge,/role","button"/);
 assert.match(bridge,/node\.tabIndex=0/);
 assert.match(bridge,/event\.key!=="Enter"&&event\.key!==" "/);
 assert.match(bridge,/summaryIds=new Set/);
 assert.match(platform,/import FornostAiSourceNavigation/);
 assert.match(platform,/<FornostAiSourceNavigation \/>/);
});
