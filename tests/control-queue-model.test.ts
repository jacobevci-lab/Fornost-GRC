import test from "node:test";
import assert from "node:assert/strict";
import type { AutomationRule, AutomationSource } from "../app/evidence-automation";
import { controlQueueGroup, filterQueueRules } from "../app/connectors/control-queue-model";

const source = {id:"source-1", name:"İstanbul Intune", vendor:"Microsoft", enabled:true} as AutomationSource;
const rule = {id:"r1", name:"Şifreleme", sourceId:source.id, controlRefs:"A.8.24", enabled:true, lastStatus:"pass", freshness:"fresh", lastRunId:"run-1", evidenceRunId:"run-1", lastEvidenceAt:"2026-11-14T10:00:00Z", remediationOwner:"BT"} as AutomationRule;

test("current passing needs source, recorded run and fresh evidence; connection alone proves nothing", () => {
  assert.equal(controlQueueGroup(rule,source),"current");
  for(const patch of [{lastStatus:undefined},{lastStatus:"error"},{freshness:"missing"},{freshness:"unknown"},{freshness:"stale"},{freshness:"expiring"},{lastRunId:undefined},{evidenceRunId:undefined},{evidenceRunId:"older-run"},{lastEvidenceAt:undefined}]) assert.equal(controlQueueGroup({...rule,...patch},source),"verify");
  assert.equal(controlQueueGroup(rule),"verify");
  assert.equal(controlQueueGroup(rule,{...source,enabled:false}),"verify");
  assert.equal(controlQueueGroup({...rule,lastStatus:"fail"},source),"failed");
  assert.equal(controlQueueGroup({...rule,lastStatus:"fail",enabled:false},source),"paused");
});

test("priority and filters retain every canonical rule including orphaned and paused records", () => {
  const rules = [rule,{...rule,id:"paused",enabled:false},{...rule,id:"orphan",sourceId:"missing"},{...rule,id:"failed",lastStatus:"fail"},{...rule,id:"error",lastStatus:"error"}];
  assert.deepEqual(filterQueueRules(rules,[source],"","","all","en").map(r=>r.id),["failed","error","orphan","r1","paused"]);
  assert.deepEqual(filterQueueRules(rules,[source],"","","attention","en").map(r=>r.id),["failed","error","orphan"]);
  assert.equal(rules[0],rule,"Do not reorder or mutate the canonical input");
  assert.equal(filterQueueRules(rules,[source],"missing","","all","en")[0].id,"orphan");
});

test("search and owner scope combine across both view modes with Turkish casing", () => {
  const rules = [rule,{...rule,id:"other",remediationOwner:"SOC"},{...rule,id:"unassigned",remediationOwner:" "}];
  assert.deepEqual(filterQueueRules(rules,[source],"istanbul","owner:BT","all","tr").map(r=>r.id),["r1"]);
  assert.equal(filterQueueRules(rules,[source],"şifreleme","unassigned","all","tr")[0].id,"unassigned");
  assert.equal(filterQueueRules(rules,[source],"absent","","all","tr").length,0);
  assert.equal(filterQueueRules(rules,[source],"A.8.24","owner:SOC","all","tr")[0].id,"other");
});
