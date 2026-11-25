import type { AiAgentKind } from "./agents";
import { cleanAiText, redactSensitiveText } from "./security";

export const AI_AGENT_BUDGET = Object.freeze({
  maxSources: 48,
  maxContextCharacters: 16_000,
  maxFindings: 8,
  maxRunsPerMinute: 2,
});

export type AgentPolicyDecision = {
  decision: "allow-read-only" | "deny";
  code: string;
  requiresHumanApproval: true;
  detail: string;
};

export const AI_AGENT_TOOL_REGISTRY: Record<AiAgentKind, {
  label: string;
  readScopes: string[];
  mutation: false;
  output: "risk-treatment" | "audit-finding" | "remediation-task";
}> = {
  risk: { label: "Risk Assurance", readScopes: ["Risk Assessment", "Varlık Envanteri", "BIA"], mutation: false, output: "risk-treatment" },
  audit: { label: "Audit Assurance", readScopes: ["Denetim Yönetimi", "Kontroller", "Kanıtlar"], mutation: false, output: "audit-finding" },
  compliance: { label: "Compliance Assurance", readScopes: ["Uyum", "Kontroller", "Kanıtlar"], mutation: false, output: "remediation-task" },
  evidence: { label: "Evidence Assurance", readScopes: ["Kanıtlar", "Kontroller", "Denetim Yönetimi"], mutation: false, output: "remediation-task" },
  vendor: { label: "Vendor Risk Assurance", readScopes: ["Tedarikçiler", "Risk Assessment", "Kanıtlar"], mutation: false, output: "remediation-task" },
  reporting: { label: "Executive Reporting", readScopes: ["Risk Assessment", "Uyum", "Denetim Yönetimi", "Tedarikçiler", "BIA", "Kanıtlar"], mutation: false, output: "remediation-task" },
};

export function createAiTraceId() {
  return `AITR-${crypto.randomUUID()}`;
}

export function decideAgentPolicy(input: { role: string; kind: AiAgentKind; sourceCount: number }): AgentPolicyDecision {
  if (!AI_AGENT_TOOL_REGISTRY[input.kind]) {
    return { decision: "deny", code: "AI-AGENT-UNKNOWN", requiresHumanApproval: true, detail: "Agent aracı kayıtlı değil." };
  }
  if (!['Admin', 'Editor'].includes(input.role)) {
    return { decision: "deny", code: "AI-AGENT-RBAC", requiresHumanApproval: true, detail: "Rol agent çalıştırmaya yetkili değil." };
  }
  if (input.sourceCount < 1) {
    return { decision: "deny", code: "AI-AGENT-NO-SOURCE", requiresHumanApproval: true, detail: "Doğrulanmış kaynak bulunamadı." };
  }
  if (input.sourceCount > AI_AGENT_BUDGET.maxSources) {
    return { decision: "deny", code: "AI-AGENT-SOURCE-BUDGET", requiresHumanApproval: true, detail: "Kaynak bütçesi aşıldı." };
  }
  return {
    decision: "allow-read-only",
    code: "AI-AGENT-READONLY-HITL",
    requiresHumanApproval: true,
    detail: "Salt okunur analiz izinli; her kayıt veya dış etki ayrı Admin onayı gerektirir.",
  };
}

export async function registerAgentControl(db: D1Database, input: {
  traceId: string;
  runId: string;
  kind: AiAgentKind;
  sourceCount: number;
  decision: AgentPolicyDecision;
  actor: string;
}) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO ai_agent_controls(
      trace_id,run_id,agent_kind,policy_decision,policy_code,source_count,context_char_budget,finding_budget,
      human_approval_required,created_by,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      cleanAiText(input.traceId, 100), cleanAiText(input.runId, 100), input.kind,
      input.decision.decision, input.decision.code, input.sourceCount,
      AI_AGENT_BUDGET.maxContextCharacters, AI_AGENT_BUDGET.maxFindings, 1,
      cleanAiText(input.actor, 320), now, now,
    ),
    db.prepare(`INSERT INTO ai_agent_trace_events(id,trace_id,stage,outcome,detail,created_at)
      VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(), input.traceId, "request", "success", `${input.kind} agent request accepted for policy evaluation`, now),
    db.prepare(`INSERT INTO ai_agent_trace_events(id,trace_id,stage,outcome,detail,created_at)
      VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(), input.traceId, "policy", input.decision.decision, redactSensitiveText(input.decision.detail, 500), now),
  ]);
}

export async function recordAgentTraceEvent(db: D1Database, input: {
  traceId: string;
  stage: "request" | "retrieval" | "provider" | "validation" | "review" | "draft" | "failure";
  outcome: "started" | "success" | "denied" | "error" | "approved" | "archived";
  detail: string;
}) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO ai_agent_trace_events(id,trace_id,stage,outcome,detail,created_at)
      VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(), cleanAiText(input.traceId, 100), input.stage, input.outcome, redactSensitiveText(input.detail, 500), now),
    db.prepare("UPDATE ai_agent_controls SET updated_at=? WHERE trace_id=?").bind(now, cleanAiText(input.traceId, 100)),
  ]);
}
