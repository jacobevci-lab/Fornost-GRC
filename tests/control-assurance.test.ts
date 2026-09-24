import assert from "node:assert/strict";
import test from "node:test";
import { buildControlAssurance, buildControlAssuranceDetail, type AssuranceRow } from "../app/control-assurance";

test("control assurance correlates evidence and audit trace and prioritizes gaps", () => {
  const rows = [
    { id: "c1", code: "CTL-001", module: "Kontroller", data: { controlRef: "A.5.15", controlTitle: "Access control", owner: "IAM", testOwner: "Audit", nextTestDate: "2027-02-01", status: "Aktif" } },
    { id: "c2", code: "CTL-002", module: "Kontroller", data: { controlRef: "A.5.16", controlTitle: "Identity", owner: "", nextTestDate: "2026-01-01", status: "İyileştirme Gerekli" } },
    { id: "e1", code: "EVD-001", module: "Kanıtlar", data: { controlRef: "A.5.15", status: "Onaylandı", expiresAt: "2027-03-01" } },
    { id: "e2", code: "EVD-002", module: "Kanıtlar", data: { controlRef: "A.5.16", status: "Süresi Doldu", expiresAt: "2026-02-01" } },
    { id: "a1", code: "AUD-001", module: "Denetim Yönetimi", data: { controlRef: "A.5.15" } },
  ];
  const result = buildControlAssurance(rows, "2026-09-20");
  assert.equal(result.total, 2);
  assert.equal(result.healthy, 1);
  assert.equal(result.currentEvidence, 1);
  assert.equal(result.overdueTests, 1);
  assert.equal(result.items[0].reference, "A.5.16");
  assert.equal(result.items[0].state, "critical");
  assert.deepEqual(result.items[0].reasons, ["owner-missing", "test-owner-missing", "test-overdue", "evidence-stale", "audit-missing", "control-needs-improvement"]);
  assert.equal(result.items[1].state, "healthy");
});

test("control assurance treats missing test and evidence as actionable gaps", () => {
  const result = buildControlAssurance([
    { id: "c1", module: "Kontroller", data: { controlRef: "CTL-X", owner: "Risk", testOwner: "Assurance", status: "Aktif" } },
  ], "2026-09-20");
  assert.equal(result.items[0].score, 40);
  assert.deepEqual(result.items[0].reasons, ["test-date-missing", "evidence-missing", "audit-missing"]);
});

const lineageRows: AssuranceRow[] = [
  {
    id: "control-1",
    code: "CTRL-01",
    module: "Kontroller",
    data: {
      controlRef: "CTRL-01",
      controlTitle: "Privileged access review",
      owner: "Security",
      testOwner: "Internal Audit",
      frequency: "Quarterly",
      nextTestDate: "2026-10-10",
      lastTestResult: "Effective",
      status: "Aktif",
    },
  },
  {
    id: "framework-1",
    module: "Uyum",
    data: {
      framework: "ISO 27001:2022",
      controlRef: "CTRL-01",
      controlTitle: "Access rights",
      owner: "GRC",
      status: "Uygun",
    },
  },
  {
    id: "evidence-1",
    module: "Kanıtlar",
    data: {
      evidenceTitle: "Quarterly PAM review export",
      controlRef: "CTRL-01",
      owner: "Security",
      status: "Onaylandı",
      expiresAt: "2026-12-31",
    },
  },
  {
    id: "automation-1",
    module: "Kanıt Otomasyonu",
    data: {
      kind: "automation-rule",
      title: "PAM review evidence collector",
      automationControlRefs: "CTRL-01",
      automationRiskRef: "RISK-01",
      status: "Aktif",
    },
  },
  {
    id: "audit-1",
    module: "Denetim Yönetimi",
    data: {
      auditName: "ISO surveillance audit",
      controlRef: "CTRL-01",
      riskRef: "RISK-01",
      status: "Devam Ediyor",
    },
  },
  {
    id: "finding-1",
    module: "Bulgular ve CAPA",
    data: {
      finding: "Review evidence needs stronger approval trace",
      findingControlRef: "CTRL-01",
      findingRiskRef: "RISK-01",
      status: "Açık",
    },
  },
  {
    id: "risk-1",
    code: "RISK-01",
    module: "Risk Assessment",
    data: {
      title: "Privileged access misuse",
      owner: "Security",
      status: "Açık",
    },
  },
];

test("control assurance resolves compliance requirements linked by controlRef", () => {
  const summary = buildControlAssurance(lineageRows, "2026-09-24");
  assert.equal(summary.total, 1);
  assert.equal(summary.items[0]?.frameworkCount, 1);
  assert.equal(summary.items[0]?.evidenceCount, 1);
  assert.equal(summary.items[0]?.automationCount, 1);
  assert.equal(summary.items[0]?.openFindingCount, 1);
});

test("control assurance detail builds the full control-to-risk lineage", () => {
  const detail = buildControlAssuranceDetail(lineageRows, "control-1", "2026-09-24");
  assert.ok(detail);
  assert.equal(detail.frameworks.length, 1);
  assert.equal(detail.evidence.length, 1);
  assert.equal(detail.automations.length, 1);
  assert.equal(detail.audits.length, 1);
  assert.equal(detail.findings.length, 1);
  assert.equal(detail.risks.length, 1);
  assert.equal(detail.risks[0]?.code, "RISK-01");
  assert.equal(detail.test.status, "planned");
  assert.equal(detail.connectedStages, 6);
  assert.equal(detail.totalStages, 6);
  assert.equal(detail.lineagePercent, 100);
});

test("control assurance detail returns null for a non-control id", () => {
  assert.equal(buildControlAssuranceDetail(lineageRows, "risk-1", "2026-09-24"), null);
});
