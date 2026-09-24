import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { clean } from "../../integrations/security";
import { buildContinuousAssuranceCapaCandidate } from "../../../continuous-assurance-capa";

type Env = Record<string, unknown> & { DB: D1Database };
type AutomationFinding = {
  id: string;
  rule_id: string;
  evidence_id: string | null;
  title: string;
  severity: string;
  owner: string;
  due_date: string;
  status: string;
  detail: string;
};
type AutomationRule = { id: string; name: string; control_refs: string };
type EvidenceRun = { response_hash: string; evidence_id: string; created_at: string };
type ExistingFinding = { id: string; code: string; status: string };

const enterpriseSchema = [
  `CREATE TABLE IF NOT EXISTS enterprise_findings(id TEXT PRIMARY KEY NOT NULL,code TEXT NOT NULL UNIQUE,source_type TEXT NOT NULL,source_ref TEXT NOT NULL,source_title TEXT NOT NULL,finding_type TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,severity TEXT NOT NULL,owner TEXT NOT NULL,reviewer TEXT NOT NULL,root_cause TEXT NOT NULL,corrective_action TEXT NOT NULL,preventive_action TEXT NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',risk_ref TEXT,control_ref TEXT,evidence_reference TEXT,evidence_sha256 TEXT,verification_evidence_reference TEXT,verification_evidence_sha256 TEXT,acceptance_rationale TEXT,accept_until TEXT,recurrence_count INTEGER NOT NULL DEFAULT 0,detected_by TEXT NOT NULL,detected_at TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,started_by TEXT,started_at TEXT,submitted_by TEXT,submitted_at TEXT,verified_by TEXT,verified_at TEXT,reopened_by TEXT,reopened_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS enterprise_findings_status_due_idx ON enterprise_findings(status,severity,due_date)`,
  `CREATE INDEX IF NOT EXISTS enterprise_findings_source_idx ON enterprise_findings(source_type,source_ref)`,
  `CREATE TABLE IF NOT EXISTS enterprise_finding_events(id TEXT PRIMARY KEY NOT NULL,finding_id TEXT NOT NULL,action TEXT NOT NULL,from_status TEXT,to_status TEXT,detail TEXT NOT NULL,evidence_reference TEXT,evidence_sha256 TEXT,actor TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS enterprise_finding_events_finding_date_idx ON enterprise_finding_events(finding_id,created_at)`,
];

async function runtime() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as Env;
}

async function ready(db: D1Database) {
  for (const sql of enterpriseSchema) await db.prepare(sql).run();
}

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
const text = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const referenceList = (value: unknown) => Array.from(new Set(
  text(value).split(/[;,|\n]+/).map((item) => item.trim()).filter(Boolean),
));

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") || 0) > 131_072) return json({ error: "İstek boyutu çok büyük." }, 413);
  const access = await requireRole(req, ["Admin", "Editor"]);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const findingId = clean(body.findingId, 100);
  if (!findingId) return json({ error: "Sürekli güvence bulgu referansı zorunludur." }, 400);

  const env = await runtime();
  await ready(env.DB);

  try {
    const finding = await env.DB.prepare(
      "SELECT id,rule_id,evidence_id,title,severity,owner,due_date,status,detail FROM evidence_automation_findings WHERE id=?",
    ).bind(findingId).first<AutomationFinding>();
    if (!finding) return json({ error: "Sürekli güvence bulgusu bulunamadı." }, 404);
    if (finding.status === "closed") return json({ error: "Kapatılmış sürekli güvence bulgusu CAPA kaydına aktarılamaz." }, 409);

    const rule = await env.DB.prepare(
      "SELECT id,name,control_refs FROM evidence_automation_rules WHERE id=?",
    ).bind(finding.rule_id).first<AutomationRule>();
    if (!rule) return json({ error: "Bulguya ait sürekli kontrol kuralı bulunamadı." }, 409);

    const mappedControls = referenceList(rule.control_refs);
    const requestedControl = clean(body.controlRef, 120);
    if (!requestedControl && mappedControls.length > 1) {
      return json({ error: "Kural birden fazla kontrole bağlı. CAPA için hedef kontrol seçilmelidir.", controlRefs: mappedControls }, 400);
    }
    const controlRef = requestedControl || mappedControls[0] || "";
    if (requestedControl && mappedControls.length && !mappedControls.includes(requestedControl)) {
      return json({ error: "Seçilen kontrol sürekli kontrol kuralının kapsamına bağlı değil.", controlRefs: mappedControls }, 409);
    }

    const evidenceReference = text(finding.evidence_id);
    if (!evidenceReference) return json({ error: "Bulgunun değişmez kaynak kanıtı bulunamadı." }, 409);
    const evidenceRun = await env.DB.prepare(
      "SELECT response_hash,evidence_id,created_at FROM evidence_automation_runs WHERE rule_id=? AND evidence_id=? AND response_hash IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    ).bind(rule.id, evidenceReference).first<EvidenceRun>();
    if (!evidenceRun || !/^[a-f0-9]{64}$/i.test(text(evidenceRun.response_hash))) {
      return json({ error: "Kaynak kanıtın SHA-256 bütünlük izi doğrulanamadı." }, 409);
    }

    const candidate = buildContinuousAssuranceCapaCandidate({
      findingId: finding.id,
      ruleId: rule.id,
      ruleName: rule.name,
      title: finding.title,
      detail: finding.detail,
      severity: finding.severity,
      owner: finding.owner,
      reviewer: clean(body.reviewer, 200),
      dueDate: clean(body.dueDate, 10) || finding.due_date,
      controlRef,
      riskRef: clean(body.riskRef, 120),
      rootCause: clean(body.rootCause, 2400),
      correctiveAction: clean(body.correctiveAction, 2400),
      preventiveAction: clean(body.preventiveAction, 2400),
      originEvidenceReference: evidenceReference,
      originEvidenceSha256: evidenceRun.response_hash,
    });
    if (!candidate.eligible || !candidate.payload) {
      return json({ error: "Sürekli güvence bulgusu kurumsal CAPA şartlarını karşılamıyor.", reasons: candidate.reasons }, 422);
    }

    const x = candidate.payload;
    const existing = await env.DB.prepare(
      "SELECT id,code,status FROM enterprise_findings WHERE source_type='continuous-control' AND source_ref=? AND control_ref=? AND status NOT IN ('closed','accepted') ORDER BY updated_at DESC LIMIT 1",
    ).bind(x.sourceRef, x.controlRef).first<ExistingFinding>();
    if (existing) {
      return json({ error: "Bu sürekli kontrol için zaten açık bir kurumsal CAPA kaydı var.", existing }, 409);
    }

    const id = `FND-${crypto.randomUUID()}`;
    const code = `FND-${new Date().getUTCFullYear()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const eventId = crypto.randomUUID();
    const eventDetail = JSON.stringify({
      origin: "continuous-assurance",
      automationFindingRef: candidate.lineage.automationFindingRef,
      automationRuleRef: candidate.lineage.automationRuleRef,
      controlRef: candidate.lineage.controlRef,
      riskRef: candidate.lineage.riskRef,
      evidenceCapturedAt: evidenceRun.created_at,
    }).slice(0, 2000);

    await env.DB.batch([
      env.DB.prepare("INSERT INTO enterprise_findings(id,code,source_type,source_ref,source_title,finding_type,title,description,severity,owner,reviewer,root_cause,corrective_action,preventive_action,due_date,status,risk_ref,control_ref,detected_by,detected_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?,?)")
        .bind(id, code, x.sourceType, x.sourceRef, x.sourceTitle, x.findingType, x.title, x.description, x.severity, x.owner, x.reviewer, x.rootCause, x.correctiveAction, x.preventiveAction, x.dueDate, x.riskRef || null, x.controlRef || null, access.actor.email, now, access.actor.email, now),
      env.DB.prepare("INSERT INTO enterprise_finding_events(id,finding_id,action,from_status,to_status,detail,evidence_reference,evidence_sha256,actor,created_at) VALUES(?,?,?,'','open',?,?,?,?,?)")
        .bind(eventId, id, "finding-promote-continuous-assurance", eventDetail, candidate.lineage.originEvidenceReference, candidate.lineage.originEvidenceSha256, access.actor.email, now),
      env.DB.prepare("UPDATE evidence_automation_findings SET status=CASE WHEN status='open' THEN 'acknowledged' ELSE status END,acknowledged_by=COALESCE(acknowledged_by,?),acknowledged_at=COALESCE(acknowledged_at,?),updated_at=? WHERE id=? AND status!='closed'")
        .bind(access.actor.email, now, now, finding.id),
    ]);

    return json({
      id,
      code,
      sourceFindingId: finding.id,
      sourceRuleId: rule.id,
      evidenceReference: candidate.lineage.originEvidenceReference,
      message: "Sürekli güvence bulgusu, kanıt bütünlüğü ve risk/kontrol izi korunarak kurumsal CAPA kaydına aktarıldı.",
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CAPA aktarımı tamamlanamadı.";
    if (/no such table|evidence_automation_/i.test(message)) return json({ error: "Sürekli güvence veri kaynağı henüz hazır değil." }, 409);
    return json({ error: message }, 400);
  }
}
