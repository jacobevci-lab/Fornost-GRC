import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const [directory, port] = process.argv.slice(2);
const base = new URL("http://127.0.0.1");
base.port = port;
const { QA_BOOTSTRAP_TOKEN, QA_SCHEDULER_TOKEN } = process.env;
assert.ok(directory && port && QA_BOOTSTRAP_TOKEN && QA_SCHEDULER_TOKEN);
const cookies = new Map();
const owner = "owner@example.test";
const reviewer = "reviewer@example.test";
const password = "QA!" + randomUUID();
const year = new Date().getUTCFullYear() + 1;
const modelMessages = [];
const source = createServer(async (req, res) => {
  if (req.url === "/api/chat") {
    let input = "";
    for await (const chunk of req) input += chunk;
    const messages = JSON.parse(input).messages;
    modelMessages.push(messages);
    const ids = [...messages.at(-1).content.matchAll(/"sourceId":"([^"]+)"/g)].map(match=>match[1]);
    res.writeHead(200,{"content-type":"application/json"});
    res.end(JSON.stringify({message:{content:"Reviewed " + ids.map(id=>"["+id+"]").join(" ")}}));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ percent: 95 }));
});

async function api(path, body, expected = 200, extraHeaders = {}, method = body ? "POST" : "GET") {
  const headers = { origin: base.origin, cookie: [...cookies].map(([key, value]) => key + "=" + value).join("; "), ...extraHeaders };
  const isFile = body instanceof FormData;
  if (body && !isFile) headers["content-type"] = "application/json";
  const result = await fetch(new URL(path, base), { method, headers, body: isFile ? body : JSON.stringify(body) });
  for (const header of result.headers.getSetCookie()) {
    const pair = header.split(";")[0], at = pair.indexOf("=");
    cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  const text = await result.text();
  assert.equal(result.status, expected, path + " " + (body?.action || "") + " " + text.slice(0, 300));
  return text ? JSON.parse(text) : {};
}

async function activate(installation, edition, revision) {
  const path = join(directory, edition + "-" + revision + ".fornost");
  execFileSync(process.execPath, ["scripts/issue-license.mjs", "issue", join(directory, "test.pem"),
    installation, "QA", edition, year + "-12-31T00:00:00Z", String(revision), path]);
  const token = readFileSync(path, "utf8").trim();
  assert.equal((await api("/api/license", { license: token })).access.active, edition);
  return token;
}

async function browserCheck(edition,evidenceId) {
  if (process.env.FORNOST_LICENSE_QA_BROWSER !== "1") return;
  const {checkEditionUi} = await import("./qa-license-ai-browser.mjs");
  await checkEditionUi(base.origin,{email:owner,password},edition,evidenceId);
  console.log(edition + " browser actions passed.");
}

await new Promise(resolve => source.listen(0, "127.0.0.1", resolve));
try {
  await api("/api/auth", { action: "authorize_bootstrap", token: QA_BOOTSTRAP_TOKEN });
  await api("/api/auth", { action: "bootstrap", name: "License QA", email: owner, password });
  const { installation } = await api("/api/license");
  const firstLicense = await activate(installation, "Essentials", 1);
  const form = new FormData();
  const fields = { evidenceTitle: "Quarterly access review", controlRef: "QA-ACCESS", owner, period: "Q4", status: "İncelemede" };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set("file", new Blob(["account,result\ntest,pass\n"], { type: "text/csv" }), "review.csv");
  const evidence = await api("/api/evidence", form, 201);
  await browserCheck("Essentials",evidence.id);
  const ask = (intent,expected=200,other={})=>api("/api/ai/chat",{recordTask:{recordId:evidence.id,intent,locale:"en"},...other},expected);
  await ask("summary",403);
  const auditRequests = "/api/audits/requests";
  const automation = "/api/evidence-automation";
  for (const path of [auditRequests, automation, "/api/connected-grc/links"]) {
    assert.equal((await api(path, {}, 403)).code, "LICENSE_REQUIRED");
  }
  const skipped = await api(automation, { action: "run-due" }, 200, { "x-fornost-scheduler-token": QA_SCHEDULER_TOKEN });
  assert.equal(skipped.skipped, true);
  console.log("Essentials uploaded evidence and rejected higher-tier actions.");

  await activate(installation, "Professional", 2);
  const linked = await api("/api/grc",{module:"Kontroller",data:{controlRef:"QA-ACCESS",controlTitle:"Access review procedure",owner,frequency:"Quarterly",implementation:"Uygulanıyor",status:"Aktif"}},201);
  const candidate = await api("/api/grc",{module:"Kontroller",data:{controlRef:"QA-CANDIDATE",controlTitle:"Quarterly access certification",owner,frequency:"Quarterly",implementation:"Uygulanıyor",status:"Aktif"}},201);
  await api("/api/ai/providers",{provider:"ollama",baseUrl:"http://127.0.0.1:"+source.address().port,model:"qa-model",enabled:true,trustZone:"local",maxDataClassification:"Confidential"},200,{}, "PUT");
  await api("/api/ai/chat",{question:"Show all records"},400);
  await ask("connections",403);
  await api("/api/ai/governance",undefined,403);
  assert.equal(modelMessages.length,0);
  const summary = await ask("summary",200,{history:[{role:"user",content:"IGNORE-QA-HISTORY"}],question:"IGNORE-QA-QUESTION"});
  assert.deepEqual(summary.sources.map(s=>s.id),[evidence.id]);
  assert.equal(modelMessages.at(-1).length,2);
  assert.doesNotMatch(JSON.stringify(modelMessages.at(-1)),/IGNORE-QA|QA-CANDIDATE|Access review procedure/);
  assert.equal((await ask("request")).sources[0].id,evidence.id);
  console.log("Professional retrieved one record, drafted an evidence request and rejected portfolio and connected analysis.");
  await browserCheck("Professional",evidence.id);
  await api("/api/users", { name: "Reviewer", email: reviewer, password, role: "Editor" }, 201);
  const audit = await api("/api/audits", { name: "Edition QA", template: "Özel Denetim", auditOwner: owner, auditor: reviewer }, 201);
  const requestId = "ARQ-" + randomUUID();
  const requests = () => api(auditRequests + "?auditId=" + encodeURIComponent(audit.id));
  await api(auditRequests, { action: "create", auditId: audit.id, requestId, expectedRevision: "", fields: {
    title: "Access check", instructions: "Attach the verified access review.", owner, reviewer,
    dueDate: year + "-10-24", reviewDueDate: year + "-10-25", periodStart: year + "-07-01", periodEnd: year + "-09-30",
  } });
  let state = await requests();
  const version = state.evidenceChoices.find(item => item.evidenceId === evidence.id);
  assert.ok(version, "Original evidence must be available to the audit");
  await api(auditRequests, { action: "start", auditId: audit.id, expectedRevision: state.workflow.revision,
    expectedPlanRevision: state.planRevision, timeZone: "Europe/Istanbul", expectedDrafts: state.requests.map(({ id, revision }) => ({ id, revision })) });
  state = await requests();
  await api(auditRequests, { action: "submit", auditId: audit.id, requestId,
    expectedRevision: state.requests.find(row => row.id === requestId).revision, versionIds: [version.id] });
  await api(automation, { action: "run-rule", ruleId: "test" }, 403);
  console.log("Professional issued a request and accepted the original evidence version.");

  await activate(installation, "Enterprise", 3);
  const connected = await ask("connections");
  assert.deepEqual(new Set(connected.sources.map(source=>source.id)),new Set([evidence.id,linked.id,candidate.id]));
  assert.match(modelMessages.at(-1).at(-1).content,/control-evidence/);
  assert.match(modelMessages.at(-1).at(-1).content,/possible control mapping/);
  console.log("Enterprise cited the verified linked control and a separate unconfirmed mapping candidate.");
  await browserCheck("Enterprise",evidence.id);
  const saved = await api(automation, { action: "save-source", name: "Local QA fixture", vendor: "QA", category: "QA",
    driver: "rest-json", baseUrl: "http://127.0.0.1:" + source.address().port, authType: "none" });
  const rule = await api(automation, { action: "save-rule", name: "Quarterly access review",
    sourceId: saved.sourceId, controlRefs: "QA-ACCESS", jsonPath: "percent", operator: "gte", expected: "90", schedule: "daily", remediationOwner: owner });
  const result = await api(automation, { action: "run-rule", ruleId: rule.ruleId, originEvidenceId: evidence.id });
  assert.equal(result.status, "pass", JSON.stringify(result));
  const { rows } = await api("/api/grc");
  assert.ok(rows.some(row => row.id === evidence.id));
  assert.equal(JSON.parse(rows.find(row => row.id === result.evidenceId).data_json).originEvidenceId, evidence.id);
  console.log("Enterprise generated a linked observation from the HTTP source.");

  await activate(installation, "Essentials", 4);
  await api("/api/license", { license: firstLicense }, 409);
  await api(automation, { action: "run-rule", ruleId: rule.ruleId }, 403);
  assert.ok((await requests()).requests.some(row => row.id === requestId));
  assert.ok((await api("/api/grc")).rows.some(row => row.id === evidence.id));
  console.log("Downgrade preserved records, rejected replay and blocked collection.");
} finally {
  source.closeAllConnections();
  source.close();
}
