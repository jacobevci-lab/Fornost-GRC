import { redactSensitiveText } from "./security";

export const AI_DRAFT_KINDS = ["risk-treatment", "audit-finding", "remediation-task"] as const;
export type AiDraftKind = typeof AI_DRAFT_KINDS[number];
export type AiDraftStatus = "pending" | "approved" | "rejected";

const fields: Record<AiDraftKind, string[]> = {
  "risk-treatment": ["title", "riskStatement", "proposedTreatment", "owner", "dueDate", "priority"],
  "audit-finding": ["title", "condition", "criteria", "impact", "recommendation", "severity"],
  "remediation-task": ["title", "description", "owner", "dueDate", "priority", "acceptanceCriteria"],
};

export function isAiDraftKind(value: unknown): value is AiDraftKind {
  return typeof value === "string" && AI_DRAFT_KINDS.includes(value as AiDraftKind);
}

function extractJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || value.slice(value.indexOf("{"), value.lastIndexOf("}") + 1);
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function validateAiDraftInput(kind: AiDraftKind, input: unknown) {
  const parsed = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
  if (!parsed) throw new Error("Taslak içeriği geçerli değil.");
  const payloadValue = parsed.payload;
  if (!payloadValue || typeof payloadValue !== "object" || Array.isArray(payloadValue)) {
    throw new Error("AI taslak içeriği beklenen şemaya uymuyor.");
  }
  const rawPayload = payloadValue as Record<string, unknown>;
  const payload: Record<string, string> = {};
  for (const field of fields[kind]) {
    const value = redactSensitiveText(rawPayload[field], field === "description" || field === "recommendation" || field === "acceptanceCriteria" ? 1600 : 600);
    if (!value) throw new Error(`AI taslağında zorunlu alan eksik: ${field}`);
    payload[field] = value;
  }
  if (payload.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate)) {
    throw new Error("AI taslağındaki hedef tarih YYYY-AA-GG biçiminde olmalıdır.");
  }
  const title = redactSensitiveText(parsed.title || payload.title, 180);
  const rationale = redactSensitiveText(parsed.rationale, 1200);
  if (!title || !rationale) throw new Error("AI taslak başlığı veya gerekçesi eksik.");
  return { title, rationale, payload };
}

export function parseAiDraftResponse(kind: AiDraftKind, response: string) {
  const parsed = extractJson(response);
  if (!parsed) throw new Error("AI geçerli bir JSON taslağı üretmedi.");
  return validateAiDraftInput(kind, parsed);
}

export function draftSchemaInstruction(kind: AiDraftKind) {
  const payload = Object.fromEntries(fields[kind].map((field) => [field, "required string"]));
  return JSON.stringify({ title: "required string", rationale: "required string", payload });
}
