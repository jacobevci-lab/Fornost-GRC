import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {connectedGrcNavigation} from "../app/connected-grc-navigation";

const connected=readFileSync("app/connected-grc.tsx","utf8");
const row=(module:string,id:string,code?:string,data:Record<string,unknown>={})=>({module,id,code,data});

test("Connected GRC resolves governed records to exact focus keys",()=>{
 assert.deepEqual(connectedGrcNavigation(row("Risk Assessment","risk-internal","RSK-1")),{module:"Risk Assessment",ref:"risk-internal",filterKey:"riskRef"});
 assert.deepEqual(connectedGrcNavigation(row("Bulgular ve CAPA","finding-internal","FND-1")),{module:"Bulgular ve CAPA",ref:"FND-1",filterKey:"findingRef"});
 assert.deepEqual(connectedGrcNavigation(row("Kontroller","control-internal","CTRL-1")),{module:"Kontroller",ref:"CTRL-1",filterKey:"controlRef"});
 assert.deepEqual(connectedGrcNavigation(row("Kanıt Otomasyonu","RULE-1","AUTO-1")),{module:"Kanıt Otomasyonu",ref:"RULE-1",filterKey:"ruleRef"});
});

test("derived enterprise rows resolve only when a canonical governed reference is known",()=>{
 assert.deepEqual(connectedGrcNavigation(row("Kanıt Otomasyonu","enterprise:automation-rule:RULE-9",undefined,{kind:"automation-rule",aliasRefs:["RULE-9","RULE:RULE-9"]})),{module:"Kanıt Otomasyonu",ref:"RULE-9",filterKey:"ruleRef"});
 assert.deepEqual(connectedGrcNavigation(row("Kanıt Otomasyonu","enterprise:automation-assurance:ASSURANCE:RULE-10",undefined,{kind:"automation-assurance",automationRuleRef:["RULE:RULE-10","RULE-10"]})),{module:"Kanıt Otomasyonu",ref:"RULE-10",filterKey:"ruleRef"});
 assert.deepEqual(connectedGrcNavigation(row("Bulgular ve CAPA","enterprise:finding:internal","FND-9",{kind:"finding"})),{module:"Bulgular ve CAPA",ref:"FND-9",filterKey:"findingRef"});
 assert.equal(connectedGrcNavigation(row("Bulgular ve CAPA","enterprise:remediation:internal","FND-9-REM",{kind:"remediation"})),undefined);
 assert.equal(connectedGrcNavigation(row("Kanıt Otomasyonu","enterprise:automation-source:SRC-1",undefined,{kind:"automation-source"})),undefined);
});

test("Connected GRC keeps unsupported or ambiguous records on safe module-level navigation",()=>{
 assert.equal(connectedGrcNavigation(row("Tedarikçiler","vendor-1","VEN-1")),undefined);
 assert.equal(connectedGrcNavigation(row("Risk Assessment","enterprise:risk:ambiguous","RSK-X")),undefined);
 assert.equal(connectedGrcNavigation(row("","missing")),undefined);
});

test("relationship register and unresolved references use contextual record navigation",()=>{
 assert.match(connected,/import \{ connectedGrcNavigation \} from "\.\/connected-grc-navigation"/);
 assert.match(connected,/import \{ navigateToFornost \} from "\.\/navigation-focus"/);
 assert.match(connected,/function openRecord\(row:ConnectedGrcRow\)/);
 assert.match(connected,/source:"connected-grc-register"/);
 assert.match(connected,/filter:\{\[target\.filterKey\]:target\.ref\}/);
 assert.match(connected,/onClick=\{\(\)=>openRecord\(link\.source\)\}/);
 assert.match(connected,/onClick=\{\(\)=>openRecord\(link\.target\)\}/);
 assert.match(connected,/onClick=\{\(\)=>openRecord\(item\.source\)\}/);
});
