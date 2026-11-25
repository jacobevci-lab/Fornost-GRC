import test from "node:test";
import assert from "node:assert/strict";
import {buildConnectedGrcGraph, type ConnectedGrcRow} from "../app/connected-grc-model";
import {indexTrailLinks,traceRecords} from "../app/module-record-trail";

const row = (id:string,module:string,data:Record<string,unknown> = {}):ConnectedGrcRow=>({id,code:id,module,data});
const audit=row("AUD-1","Denetim Yönetimi",{requirementRef:"CTL-1",evidenceRef:"EVD-2"});
const control=row("CTL-1","Kontroller");
const first=row("EVD-1","Kanıtlar",{controlRef:"CTL-1"}),second=row("EVD-2","Kanıtlar",{controlRef:"CTL-1"});
const graph=indexTrailLinks(buildConnectedGrcGraph([audit,control,first,second]).links);
test("audit prioritizes its actual control and supports branching to a different evidence record",()=>{
  assert.deepEqual(traceRecords(graph,audit,[],3).nodes.map(n=>n.row.id),["AUD-1","CTL-1","EVD-1"]);
  assert.deepEqual(traceRecords(graph,audit,["CTL-1","EVD-2"],12).nodes.map(n=>n.row.id),["AUD-1","CTL-1","EVD-2"]);
});
test("cycles and disappeared or unauthorized targets cannot create a link",()=>{
  const chain=traceRecords(indexTrailLinks(buildConnectedGrcGraph([audit,first]).links),audit,["CTL-1","EVD-1"],10);
  assert.deepEqual(chain.nodes.map(n=>n.row.id),["AUD-1"]);assert.equal(chain.more,false);
});
test("a vendor finding leads to its recorded corrective action",()=>{
  const vendor=row("VEN-1","Tedarikçiler"), finding=row("FND-1","Bulgular ve CAPA",{findingVendorRef:"VEN-1"});
  const action=row("CAPA-1","Bulgular ve CAPA",{remediationFindingRef:"FND-1"});
  const index=indexTrailLinks(buildConnectedGrcGraph([vendor,finding,action]).links);
  assert.deepEqual(traceRecords(index,vendor,[],3).nodes.map(n=>n.row.id),["VEN-1","FND-1","CAPA-1"]);
});
