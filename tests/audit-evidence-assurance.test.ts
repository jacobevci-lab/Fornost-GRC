import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAuditEvidenceAssurance } from "../app/audit-evidence-assurance";

test("audit evidence assurance resolves current, stale and missing control evidence", () => {
  const requirements = [
    { id: "AUD-1", data: { controlRef: "CTL-001" } },
    { id: "AUD-2", data: { controlRef: "CTL-002" } },
    { id: "AUD-3", data: { controlRef: "CTL-003" } },
  ];
  const evidence = [
    { id: "EVD-1", data: { controlRef: "CTL-001", status: "Onaylandı" } },
    { id: "EVD-2", data: { controlRef: "CTL-002", status: "Onaylandı", expiresAt: "2026-01-01" } },
  ];
  const result = buildAuditEvidenceAssurance(requirements, evidence, new Date("2026-09-20T00:00:00Z"));
  assert.equal(result.total, 3);
  assert.equal(result.linked, 2);
  assert.equal(result.current, 1);
  assert.equal(result.stale, 1);
  assert.deepEqual(result.missing, ["CTL-003"]);
  assert.deepEqual(result.staleReferences, ["CTL-002"]);
  assert.equal(result.coverage, 67);
  assert.equal(result.readiness, 33);
  assert.equal(result.gate, "not-ready");
  assert.deepEqual(result.requirements.map((item) => [item.reference, item.status]), [
    ["CTL-003", "missing"],
    ["CTL-002", "stale"],
    ["CTL-001", "current"],
  ]);
  assert.deepEqual(result.gaps.map((item) => [item.reference, item.status]), [
    ["CTL-003", "missing"],
    ["CTL-002", "stale"],
  ]);
});

test("audit management exposes the live evidence assurance chain", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const css = readFileSync("app/soc2-audit.css", "utf8");
  assert.match(page, /evidenceRows=\{by\("Kanıtlar"\)\}/);
  assert.match(page, /<AuditReadinessGate mode="global" lang=\{lang\} records=\{\[\.\.\.rows,\.\.\.evidenceRows\]\}/);
  assert.match(page, /<AuditReadinessGate key=\{selected\} lang=\{lang\} auditName=\{selected\}/);
  const gate = readFileSync("app/audit-readiness-gate.tsx", "utf8");
  assert.doesNotMatch(gate, /MutationObserver|createPortal|insertAdjacentElement|classList/);
  assert.doesNotMatch(readFileSync("app/platform-experience.tsx", "utf8"), /<AuditReadinessGate/);
  assert.match(gate, /recordsKey/);
  assert.match(gate, /\/api\/audits\/readiness/);
  assert.match(css, /\.audit-evidence-assurance/);
});

test("portfolio requirements retain their own period and pinned evidence version", async () => {
  const {DatabaseSync} = await import('node:sqlite');
  const {attachAuditInheritance} = await import('../app/audit-readiness-inheritance');
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('CREATE TABLE simple_audits (id TEXT PRIMARY KEY, name TEXT); CREATE TABLE simple_grc_metadata (key TEXT PRIMARY KEY, value TEXT)');
    const db = {prepare(sql:string) {
      const statement = sqlite.prepare(sql);
      return {first: async () => statement.get(), bind: (arg:string) => ({all: async () => ({results:statement.all(arg)})})};
    }} as unknown as D1Database;
    const requirements = ['A','B','Outside'].map(id => ({
      id, module:'Denetim Yönetimi', data:{auditName:id, requirementRef:'A.5.15'}
    }));
    for (const {id} of requirements) {
      sqlite.prepare('INSERT INTO simple_audits VALUES (?,?)').run(id,id);
      sqlite.prepare('INSERT INTO simple_grc_metadata VALUES (?,?)').run('audit_posture_'+id,JSON.stringify({
        period:id==='B'?'2026-Q2':'2026-Q1',
        entries:[{ref:'A.5.15', applicability:id==='Outside'?'excluded':'included', controls:[{id:'CTL-12', evidence:id==='A'?['pin-1']:[]}]}],
        evidence:{'pin-1':{evidenceId:'e1', version:1, hash:'digest-1'}}
      }));
    }
    const scoped = await attachAuditInheritance(db, requirements);
    const data = {controlRef:'CTL-12',status:'Approved',evidenceIntegrity:'verified',period:'2026-Q1',versionNo:1,contentSha256:'digest-1'};
    const assess = (change:Record<string,unknown>={}) => buildAuditEvidenceAssurance(scoped,[{id:'e1',data:{...data,...change}}]);
    const expected = [{auditName:'A',scoped:1,current:1},{auditName:'B',scoped:1,current:0}];
    assert.deepEqual(assess().itemCoverage,expected);
    const duplicates = assess({controlRef:'A.5.15'});
    assert.equal(duplicates.requirements[0].linkedEvidence,1);
    assert.deepEqual(duplicates.itemCoverage,expected);
    for (const changed of [{versionNo:2},{contentSha256:'other'},{status:'Pending'},{status:'Güncel'},{period:'2026-Q3'},{evidenceIntegrity:'broken'}]) {
      assert.ok(assess(changed).itemCoverage.every(item => item.current === 0));
    }
  } finally { sqlite.close(); }
});
