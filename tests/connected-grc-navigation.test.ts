import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {connectedGrcNavigation} from "../app/connected-grc-navigation";

const connected=readFileSync("app/connected-grc.tsx","utf8");
const row=(module:string,id:string,code?:string)=>({module,id,code,data:{}});

test("Connected GRC resolves governed records to exact focus keys",()=>{
 assert.deepEqual(connectedGrcNavigation(row("Risk Assessment","risk-internal","RSK-1")),{module:"Risk Assessment",ref:"risk-internal",filterKey:"riskRef"});
 assert.deepEqual(connectedGrcNavigation(row("Bulgular ve CAPA","finding-internal","FND-1")),{module:"Bulgular ve CAPA",ref:"FND-1",filterKey:"findingRef"});
 assert.deepEqual(connectedGrcNavigation(row("Kontroller","control-internal","CTRL-1")),{module:"Kontroller",ref:"CTRL-1",filterKey:"controlRef"});
 assert.deepEqual(connectedGrcNavigation(row("Kanıt Otomasyonu","RULE-1","AUTO-1")),{module:"Kanıt Otomasyonu",ref:"RULE-1",filterKey:"ruleRef"});
});

test("Connected GRC keeps unsupported modules on safe module-level navigation",()=>{
 assert.equal(connectedGrcNavigation(row("Tedarikçiler","vendor-1","VEN-1")),undefined);
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
