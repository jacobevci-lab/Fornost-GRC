import { cleanAiText, redactSensitiveText } from "./security";
import { draftSchemaInstruction, isAiDraftKind, validateAiDraftInput, type AiDraftKind } from "./drafts";

export const AI_AGENT_KINDS = ["risk", "audit", "compliance", "evidence"] as const;
export type AiAgentKind = typeof AI_AGENT_KINDS[number];
export type AiAgentFinding = {
  id: string;
  title: string;
  summary: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  confidence: number;
  sourceRefs: string[];
  recommendation: string;
  draft: { kind: AiDraftKind; title: string; rationale: string; payload: Record<string, string> };
};

export const AI_AGENT_DEFINITIONS: Record<AiAgentKind, { label: string; focus: string; moduleHint: string; draftKind: AiDraftKind }> = {
  risk: { label: "Risk Agent", focus: "identify material risk exposure, weak treatments, overdue reviews and ownership gaps", moduleHint: "risk varlık BIA", draftKind: "risk-treatment" },
  audit: { label: "Audit Agent", focus: "identify unsupported requirements, overdue evidence, control design gaps and audit readiness issues", moduleHint: "denetim kanıt kontrol", draftKind: "audit-finding" },
  compliance: { label: "Compliance Agent", focus: "identify framework coverage gaps, weak control implementation and regulatory follow-up needs", moduleHint: "uyum compliance ISO SOC PCI NIST DORA KVKK GDPR kontrol", draftKind: "remediation-task" },
  evidence: { label: "Evidence Agent", focus: "identify missing, stale, failed or weakly linked evidence and validation gaps", moduleHint: "kanıt evidence denetim kontrol", draftKind: "remediation-task" },
};

export function isAiAgentKind(value: unknown): value is AiAgentKind {
  return typeof value === "string" && AI_AGENT_KINDS.includes(value as AiAgentKind);
}

export function validateAgentRequest(input: Record<string, unknown>) {
  if (!isAiAgentKind(input.kind)) throw new Error("Desteklenmeyen güvence agentı.");
  const objective = redactSensitiveText(input.objective, 1600);
  if (objective.length < 5) throw new Error("Agent için en az 5 karakterlik bir hedef yazın.");
  return { kind: input.kind, objective };
}

function extractObject(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || value.slice(value.indexOf("{"), value.lastIndexOf("}") + 1);
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function agentSchemaInstruction(kind: AiAgentKind) {
  const draftKind = AI_AGENT_DEFINITIONS[kind].draftKind;
  return JSON.stringify({
    executiveSummary: "required string",
    findings: [{
      title: "required string",
      summary: "required string",
      severity: "Low|Medium|High|Critical",
      confidence: "integer 0-100",
      sourceRefs: ["sourceId from supplied context"],
      recommendation: "required string",
      draft: { kind: draftKind, ...JSON.parse(draftSchemaInstruction(draftKind)) },
    }],
  });
}

export function parseAgentResponse(kind: AiAgentKind, response: string, allowedSourceRefs: string[]) {
  const parsed = extractObject(response);
  if (!parsed) throw new Error("Agent geçerli bir JSON raporu üretmedi.");
  const executiveSummary = redactSensitiveText(parsed.executiveSummary, 2400);
  if (!executiveSummary) throw new Error("Agent raporu yönetici özeti içermiyor.");
  if (!Array.isArray(parsed.findings)) throw new Error("Agent raporu bulgu listesi içermiyor.");
  const allowed = new Set(allowedSourceRefs);
  const expectedKind = AI_AGENT_DEFINITIONS[kind].draftKind;
  const findings: AiAgentFinding[] = parsed.findings.slice(0, 8).map((raw, index) => {
    const item = record(raw);
    if (!item) throw new Error(`Agent bulgusu ${index + 1} geçersiz.`);
    const severity = cleanAiText(item.severity, 20) as AiAgentFinding["severity"];
    const title = redactSensitiveText(item.title, 180);
    const summary = redactSensitiveText(item.summary, 1600);
    const recommendation = redactSensitiveText(item.recommendation, 1600);
    const confidence = Math.round(Number(item.confidence));
    const sourceRefs = Array.isArray(item.sourceRefs)
      ? [...new Set(item.sourceRefs.map(value => cleanAiText(value, 100)).filter(value => allowed.has(value)))].slice(0, 12)
      : [];
    const draftValue = record(item.draft);
    if (!title || !summary || !recommendation || !["Low", "Medium", "High", "Critical"].includes(severity)) throw new Error(`Agent bulgusu ${index + 1} zorunlu alanları karşılamıyor.`);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw new Error(`Agent bulgusu ${index + 1} güven skoru geçersiz.`);
    if (!sourceRefs.length) throw new Error(`Agent bulgusu ${index + 1} doğrulanmış kaynak referansı içermiyor.`);
    if (!draftValue || !isAiDraftKind(draftValue.kind) || draftValue.kind !== expectedKind) throw new Error(`Agent bulgusu ${index + 1} izin verilen taslak türüne uymuyor.`);
    const validatedDraft = validateAiDraftInput(expectedKind, draftValue);
    return { id: `F-${index + 1}`, title, summary, severity, confidence, sourceRefs, recommendation, draft: { kind: expectedKind, ...validatedDraft } };
  });
  return { executiveSummary, findings };
}

export function agentContextQuery(kind: AiAgentKind, objective: string) {
  return `${AI_AGENT_DEFINITIONS[kind].moduleHint} ${objective}`;
}
