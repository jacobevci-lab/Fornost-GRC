import assert from "node:assert/strict";
import test from "node:test";
import { buildConnectedGrcGraph, type ConnectedGrcRow } from "../app/connected-grc-model";
import { buildConnectedGrcEnterpriseRows } from "../app/connected-grc-sources";
import { buildContinuousAssuranceChains, summarizeContinuousAssurance } from "../app/continuous-assurance-chain";

function fixture(health: "healthy" | "stale" | "failing", withFinding = false, withRisk = false, dueDate = "2026-09-30") {
  const rows: ConnectedGrcRow[] = [
    { id: "ctl-1", code: "CTL-001", module: "Kontroller", data: { title: "MFA coverage", controlRef: "CTL-001" } },
    { id: "evidence-1", code: "EVD-1", module: "Kanıtlar", data: { evidenceTitle: "MFA evidence", controlRef: "CTL-001" } },
  ];
  if (withRisk) rows.push({ id: "FIND-1", code: "RSK-1", module: "Risk Assessment", data: { title: "MFA control failure risk" } });

  const enterprise = buildConnectedGrcEnterpriseRows({
    evidenceAutomation: {
      sources: [{ id: "SRC-1", name: "Defender" }],
      rules: [{ id: "RULE-1", name: "MFA continuous check", sourceId: "SRC-1", controlRefs: "CTL-001", health, freshness: health === "stale" ? "stale" : "fresh" }],
      findings: withFinding ? [{ id: "FIND-1", ruleId: "RULE-1", evidenceId: "EVD-1", title: "MFA below target", severity: "high", status: "open", owner: "security@example.test", dueDate }] : [],
    },
  });
  return [...rows, ...enterprise];
}

function namespaceFixture(rows: ConnectedGrcRow[], prefix: string) {
  const refs = ["CTL-001", "EVD-1", "SRC-1", "RULE-1", "FIND-1", "RSK-1"];
  const rewrite = (value: unknown): unknown => {
    if (typeof value === "string") return refs.reduce((text, ref) => text.replaceAll(ref, `${prefix}${ref}`), value);
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, rewrite(nested)]));
    return value;
  };
  return rows.map((row) => ({
    ...row,
    id: rewrite(row.id) as string,
    code: row.code ? rewrite(row.code) as string : row.code,
    data: rewrite(row.data) as Record<string, unknown>,
  }));
}

test("effective assurance is a complete chain without forcing findings or remediation", () => {
  const rows = fixture("healthy");
  const graph = buildConnectedGrcGraph(rows);
  const chains = buildContinuousAssuranceChains(rows, graph.links, new Date("2026-09-21T12:00:00Z"));
  assert.equal(chains.length, 1);
  assert.equal(chains[0].assuranceState, "effective");
  assert.equal(chains[0].assuranceScore, 100);
  assert.equal(chains[0].chainState, "complete");
  assert.deepEqual(chains[0].escalationReasons, []);
});

test("ineffective assurance without a finding is a broken chain requiring escalation", () => {
  const rows = fixture("failing");
  const graph = buildConnectedGrcGraph(rows);
  const [chain] = buildContinuousAssuranceChains(rows, graph.links, new Date("2026-09-21T12:00:00Z"));
  assert.equal(chain.assuranceState, "ineffective");
  assert.equal(chain.assuranceScore, 25);
  assert.equal(chain.chainState, "broken");
  assert.ok(chain.escalationReasons.includes("finding-missing"));
});

test("finding and remediation remain attention until the generated risk is linked", () => {
  const rows = fixture("failing", true, false);
  const graph = buildConnectedGrcGraph(rows);
  const [chain] = buildContinuousAssuranceChains(rows, graph.links, new Date("2026-09-21T12:00:00Z"));
  assert.equal(chain.findings.length, 1);
  assert.equal(chain.remediations.length, 1);
  assert.equal(chain.risks.length, 0);
  assert.equal(chain.chainState, "broken");
  assert.ok(chain.escalationReasons.includes("risk-link-missing"));
});

test("full ineffective assurance → finding → remediation → risk chain is traceable", () => {
  const rows = fixture("failing", true, true);
  const graph = buildConnectedGrcGraph(rows);
  const [chain] = buildContinuousAssuranceChains(rows, graph.links, new Date("2026-09-21T12:00:00Z"));
  assert.equal(chain.findings.length, 1);
  assert.equal(chain.remediations.length, 1);
  assert.equal(chain.risks.length, 1);
  assert.equal(chain.riskLinked, true);
  assert.equal(chain.chainState, "attention");
  assert.deepEqual(chain.escalationReasons, []);
});

test("overdue remediation is surfaced independently of graph completeness", () => {
  const rows = fixture("failing", true, true, "2026-09-01");
  const graph = buildConnectedGrcGraph(rows);
  const [chain] = buildContinuousAssuranceChains(rows, graph.links, new Date("2026-09-21T12:00:00Z"));
  assert.equal(chain.overdueRemediations, 1);
  assert.equal(chain.chainState, "attention");
  assert.ok(chain.escalationReasons.includes("remediation-overdue"));
});

test("summary exposes assurance posture and broken-chain pressure", () => {
  const healthyRows = fixture("healthy");
  const failingRows = namespaceFixture(fixture("failing", true, false), "B-");
  const rows = [...healthyRows, ...failingRows];
  const graph = buildConnectedGrcGraph(rows);
  const chains = buildContinuousAssuranceChains(rows, graph.links, new Date("2026-09-21T12:00:00Z"));
  const summary = summarizeContinuousAssurance(chains);
  assert.equal(summary.rules, 2);
  assert.equal(summary.effective, 1);
  assert.equal(summary.ineffective, 1);
  assert.equal(summary.averageAssuranceScore, 63);
  assert.ok(summary.brokenChains >= 1);
});

test("healthy controls do not hide open findings or overdue remediation", () => {
  const rows = fixture("healthy", true, true, "2026-09-01");
  const [chain] = buildContinuousAssuranceChains(rows, buildConnectedGrcGraph(rows).links, new Date("2026-09-21T12:00:00Z"));
  assert.equal(chain.assuranceState, "effective");
  assert.equal(chain.chainState, "attention");
  assert.ok(chain.escalationReasons.includes("open-findings"));
  assert.ok(chain.escalationReasons.includes("remediation-overdue"));
});

test("healthy orphaned rules still expose a broken control-library link", () => {
  const rows = fixture("healthy").filter(row => row.module !== "Kontroller");
  const [chain] = buildContinuousAssuranceChains(rows, buildConnectedGrcGraph(rows).links);
  assert.equal(chain.chainState, "broken");
  assert.ok(chain.escalationReasons.includes("control-link-missing"));
});

test("each open finding needs its own remediation and each remediation its own risk", () => {
  const rows = fixture("failing", true, true);
  const links = buildConnectedGrcGraph(rows).links;
  const finding = rows.find(row => row.data.kind === "automation-finding")!;
  const assurance = rows.find(row => row.data.kind === "automation-assurance")!;
  const remediation = rows.find(row => row.data.kind === "automation-remediation")!;
  const extra = {...finding, id:"second-finding"};
  rows.push(extra);
  links.push({source:assurance,target:extra,relation:"assurance-finding",matched:"second-finding",field:"automationFindingRefs"});
  let chain = buildContinuousAssuranceChains(rows, links)[0];
  assert.equal(chain.chainState, "broken");
  assert.ok(chain.escalationReasons.includes("remediation-missing"));
  const extraRemediation = {...remediation,id:"second-remediation"};
  rows.push(extraRemediation);
  links.push({source:extra,target:extraRemediation,relation:"finding-remediation",matched:"second-remediation",field:"automationRemediationRef"});
  chain = buildContinuousAssuranceChains(rows, links)[0];
  assert.ok(!chain.escalationReasons.includes("remediation-missing"));
  assert.ok(chain.escalationReasons.includes("risk-link-missing"));
  assert.equal(chain.risks.length,1,"the first branch's risk cannot cover the second branch");
});

test("date-only remediation deadlines remain valid through the whole UTC day", () => {
  const rows = fixture("failing", true, true, "2026-09-21"), links=buildConnectedGrcGraph(rows).links;
  assert.equal(buildContinuousAssuranceChains(rows,links,new Date("2026-09-21T23:59:59.999Z"))[0].overdueRemediations,0);
  assert.equal(buildContinuousAssuranceChains(rows,links,new Date("2026-09-22T00:00:00Z"))[0].overdueRemediations,1);
  for(const row of rows.filter(row=>row.data.kind==='automation-remediation'))row.data.dueDate="2026-02-30";
  assert.equal(buildContinuousAssuranceChains(rows,links,new Date("2026-09-22T00:00:00Z"))[0].overdueRemediations,0);
});

test("closed historical findings do not require new corrective work", () => {
  const rows = fixture("healthy",true,false,"2026-09-01");
  for(const row of rows.filter(row=>['automation-finding','automation-remediation'].includes(String(row.data.kind)))) row.data.status="closed";
  const [chain]=buildContinuousAssuranceChains(rows,buildConnectedGrcGraph(rows).links);
  assert.equal(chain.chainState,"complete");assert.equal(chain.overdueRemediations,0);
});

test("one resolved control cannot hide a missing reference on either rule or assurance", () => {
  for (const kind of ["automation-rule", "automation-assurance"]) {
    const rows = fixture("healthy");
    const source = rows.find(row => row.data.kind === kind)!;
    source.data.automationControlRefs = "CTL-001;CTL-MISSING";
    const graph = buildConnectedGrcGraph(rows);
    const [chain] = buildContinuousAssuranceChains(rows, graph.links, undefined, graph.unresolved);
    assert.equal(chain.controls.length, 1);
    assert.equal(chain.chainState, "broken");
    assert.ok(chain.escalationReasons.includes("control-reference-unresolved"));
    assert.equal(summarizeContinuousAssurance([chain]).completeChains, 0);
    rows.push({id:"ctl-new",code:"CTL-MISSING",module:"Kontroller",data:{title:"Restored control"}});
    const repaired = buildConnectedGrcGraph(rows);
    assert.equal(buildContinuousAssuranceChains(rows, repaired.links)[0].chainState, "complete");
  }
});

test("ambiguous additional controls block completion until the canonical identity is used", () => {
  const rows = fixture("healthy");
  rows.push(...["control-a", "control-b"].map(id => ({id, code:"CTL-DUPLICATE",module:"Kontroller",data:{}})));
  const rule = rows.find(row => row.data.kind === "automation-rule")!;
  rule.data.automationControlRefs = ["CTL-001", "CTL-DUPLICATE"];
  let graph = buildConnectedGrcGraph(rows);
  assert.ok(graph.unresolved.some(ref => ref.reason === "ambiguous"));
  assert.equal(buildContinuousAssuranceChains(rows, graph.links)[0].chainState, "broken");
  rule.data.automationControlRefs = ["CTL-001", "control-a"];
  graph = buildConnectedGrcGraph(rows);
  assert.equal(buildContinuousAssuranceChains(rows, graph.links)[0].chainState, "complete");
});

test("unresolved controls on another chain do not contaminate a healthy chain", () => {
  const rows = [...fixture("healthy"), ...namespaceFixture(fixture("healthy"), "OTHER-")];
  const other = rows.find(row => row.data.kind === "automation-rule" && row.id.includes("OTHER-"))!;
  other.data.automationControlRefs = "OTHER-CTL-001;MISSING";
  const graph = buildConnectedGrcGraph(rows);
  const chains = buildContinuousAssuranceChains(rows, graph.links);
  assert.deepEqual(chains.map(chain => chain.chainState), ["complete", "broken"]);
});
