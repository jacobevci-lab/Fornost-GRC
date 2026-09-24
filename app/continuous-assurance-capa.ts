import { validateFinding } from "./findings/domain";

export type ContinuousAssuranceCapaInput = {
  findingId: string;
  ruleId: string;
  ruleName: string;
  title: string;
  detail: string;
  severity: string;
  owner: string;
  reviewer: string;
  dueDate: string;
  controlRef: string;
  riskRef: string;
  rootCause: string;
  correctiveAction: string;
  preventiveAction: string;
  originEvidenceReference: string;
  originEvidenceSha256: string;
};

export type CapaPromotionCandidate = {
  eligible: boolean;
  reasons: string[];
  payload?: ReturnType<typeof validateFinding>;
  lineage: {
    automationFindingRef: string;
    automationRuleRef: string;
    controlRef: string;
    riskRef: string;
    originEvidenceReference: string;
    originEvidenceSha256: string;
  };
};

const text = (value: unknown) => String(value ?? "").trim();
const digest = (value: unknown) => /^[a-f0-9]{64}$/i.test(text(value));

export function buildContinuousAssuranceCapaCandidate(
  input: ContinuousAssuranceCapaInput,
  today = new Date().toISOString().slice(0, 10),
): CapaPromotionCandidate {
  const reasons: string[] = [];
  const lineage = {
    automationFindingRef: text(input.findingId),
    automationRuleRef: text(input.ruleId),
    controlRef: text(input.controlRef),
    riskRef: text(input.riskRef),
    originEvidenceReference: text(input.originEvidenceReference),
    originEvidenceSha256: text(input.originEvidenceSha256).toLowerCase(),
  };

  if (!lineage.automationFindingRef) reasons.push("automation-finding-reference-required");
  if (!lineage.automationRuleRef) reasons.push("automation-rule-reference-required");
  if (!lineage.controlRef) reasons.push("control-link-required");
  if (!lineage.riskRef) reasons.push("risk-link-required");
  if (!lineage.originEvidenceReference || !digest(lineage.originEvidenceSha256)) reasons.push("origin-evidence-integrity-required");
  if (!text(input.reviewer)) reasons.push("independent-reviewer-required");
  if (text(input.owner).toLowerCase() === text(input.reviewer).toLowerCase() && text(input.owner)) reasons.push("maker-checker-separation-required");

  const rawPayload: Record<string, unknown> = {
    sourceType: "continuous-control",
    sourceRef: lineage.automationRuleRef,
    sourceTitle: text(input.ruleName) || `Continuous control ${lineage.automationRuleRef}`,
    findingType: "control-deficiency",
    title: text(input.title),
    description: `${text(input.detail)}\n\nContinuous assurance finding: ${lineage.automationFindingRef}; rule: ${lineage.automationRuleRef}`.trim(),
    severity: text(input.severity).toLowerCase(),
    owner: text(input.owner).toLowerCase(),
    reviewer: text(input.reviewer).toLowerCase(),
    rootCause: text(input.rootCause),
    correctiveAction: text(input.correctiveAction),
    preventiveAction: text(input.preventiveAction),
    dueDate: text(input.dueDate),
    riskRef: lineage.riskRef,
    controlRef: lineage.controlRef,
  };

  if (!reasons.length) {
    try {
      const validated = validateFinding(rawPayload, today);
      return { eligible: true, reasons: [], payload: validated, lineage };
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : "canonical-finding-validation-failed");
    }
  }

  return { eligible: false, reasons: Array.from(new Set(reasons)), lineage };
}
