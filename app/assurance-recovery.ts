export type AssuranceState = "effective" | "degraded" | "ineffective" | "unknown";
export type RetestResult = "not-run" | "pass" | "fail" | "error";
export type EvidenceFreshness = "fresh" | "stale" | "missing" | "unknown";
export type RecoveryState =
  | "blocked"
  | "ready-for-retest"
  | "retest-error"
  | "retest-failed"
  | "evidence-degraded"
  | "recovered";

export type AssuranceRecoveryInput = {
  assuranceState: AssuranceState;
  assuranceScore?: number;
  remediationStatus: string;
  closureEvidenceRef?: string;
  closureEvidenceSha256?: string;
  retestResult?: RetestResult;
  retestEvidenceFreshness?: EvidenceFreshness;
  riskLinked?: boolean;
};

export type AssuranceRecoveryDecision = {
  recoveryState: RecoveryState;
  readyForRetest: boolean;
  resultingAssuranceState: AssuranceState;
  resultingAssuranceScore: number;
  findingAction: "none" | "keep-open" | "reopen" | "eligible-for-closure";
  riskAction: "none" | "reassess" | "reassess-and-escalate";
  nextActions: string[];
};

const normalized = (value: unknown) => String(value ?? "").trim().toLowerCase();
const validDigest = (value: unknown) => /^[a-f0-9]{64}$/i.test(String(value ?? "").trim());
const score = (state: AssuranceState, current?: number) => {
  if (state === "effective") return 100;
  if (state === "degraded") return 65;
  if (state === "ineffective") return 25;
  const parsed = Number(current);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
};
const remediationVerified = (status: string) => ["verified", "closed", "completed"].includes(normalized(status));

export function evaluateAssuranceRecovery(input: AssuranceRecoveryInput): AssuranceRecoveryDecision {
  const currentState = input.assuranceState || "unknown";
  const currentScore = score(currentState, input.assuranceScore);
  const remediationReady = remediationVerified(input.remediationStatus);
  const evidenceReady = Boolean(String(input.closureEvidenceRef || "").trim()) && validDigest(input.closureEvidenceSha256);
  const readyForRetest = remediationReady && evidenceReady;
  const retest = input.retestResult || "not-run";
  const freshness = input.retestEvidenceFreshness || "unknown";
  const riskLinked = Boolean(input.riskLinked);

  if (!readyForRetest) {
    const nextActions: string[] = [];
    if (!remediationReady) nextActions.push("verify-remediation");
    if (!evidenceReady) nextActions.push("attach-verified-closure-evidence");
    return {
      recoveryState: "blocked",
      readyForRetest: false,
      resultingAssuranceState: currentState,
      resultingAssuranceScore: currentScore,
      findingAction: "keep-open",
      riskAction: "none",
      nextActions,
    };
  }

  if (retest === "not-run") {
    return {
      recoveryState: "ready-for-retest",
      readyForRetest: true,
      resultingAssuranceState: currentState,
      resultingAssuranceScore: currentScore,
      findingAction: "keep-open",
      riskAction: "none",
      nextActions: ["run-control-retest"],
    };
  }

  if (retest === "error") {
    return {
      recoveryState: "retest-error",
      readyForRetest: true,
      resultingAssuranceState: currentState === "effective" ? "degraded" : currentState,
      resultingAssuranceScore: currentState === "effective" ? 65 : currentScore,
      findingAction: "keep-open",
      riskAction: "none",
      nextActions: ["resolve-retest-error", "run-control-retest"],
    };
  }

  if (retest === "fail") {
    return {
      recoveryState: "retest-failed",
      readyForRetest: true,
      resultingAssuranceState: "ineffective",
      resultingAssuranceScore: 25,
      findingAction: "reopen",
      riskAction: riskLinked ? "reassess-and-escalate" : "none",
      nextActions: ["reopen-remediation", ...(riskLinked ? ["reassess-linked-risk"] : ["link-risk-if-material"])],
    };
  }

  if (freshness !== "fresh") {
    return {
      recoveryState: "evidence-degraded",
      readyForRetest: true,
      resultingAssuranceState: "degraded",
      resultingAssuranceScore: 65,
      findingAction: "keep-open",
      riskAction: "none",
      nextActions: ["collect-fresh-retest-evidence", "run-control-retest"],
    };
  }

  return {
    recoveryState: "recovered",
    readyForRetest: true,
    resultingAssuranceState: "effective",
    resultingAssuranceScore: 100,
    findingAction: "eligible-for-closure",
    riskAction: riskLinked ? "reassess" : "none",
    nextActions: riskLinked ? ["reassess-linked-risk"] : [],
  };
}
