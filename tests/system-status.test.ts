import assert from "node:assert/strict";
import test from "node:test";
import { parseIntegrationStatus, parseSystemStatus } from "../app/system-status";
test("system probes preserve degraded results without treating missing data as healthy", () => {
  assert.deepEqual(parseSystemStatus({checks:{database:{ok:true},bucket:{ok:false}}}),{database:"ok",bucket:"error"});
  for(const body of [null,{},[],{checks:{database:{ok:"true"}}}]) assert.deepEqual(parseSystemStatus(body),{database:"unknown",bucket:"unknown"});
});
test("integration status requires a valid dated test and honors unavailable history", () => {
  const row={status:"success",testedAt:"2026-10-04T10:00:00Z"};
  assert.equal(parseIntegrationStatus({health:{email:row}},"email").state,"ok");
  assert.equal(parseIntegrationStatus({health:{email:{...row,status:"error"}}},"email").state,"error");
  for(const body of [null,{health:{}},{health:{email:{status:"success"}}},{health:{email:{...row,testedAt:"bad"}}},{available:false,health:{email:row}}]) assert.equal(parseIntegrationStatus(body,"email").state,"unknown");
});
