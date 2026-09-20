export type AssuranceRow = {
  id: string;
  code?: string;
  module: string;
  data: Record<string, unknown>;
};

export type ControlAssuranceItem = {
  control: AssuranceRow;
  reference: string;
  title: string;
  owner: string;
  evidenceCount: number;
  currentEvidenceCount: number;
  auditCount: number;
  nextTestDate: string;
  testOverdue: boolean;
  score: number;
  state: "healthy" | "attention" | "critical";
  reasons: string[];
};

const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const key = (value: unknown) => clean(value).toLocaleLowerCase("tr-TR");
const dateValue = (value: unknown) => {
  const text = clean(value);
  if (!text) return Number.NaN;
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
};
const includes = (value: unknown, accepted: string[]) => accepted.includes(key(value));

export function buildControlAssurance(rows: AssuranceRow[], today = new Date().toISOString().slice(0, 10)) {
  const controls = rows.filter((row) => row.module === "Kontroller");
  const evidence = rows.filter((row) => row.module === "Kanıtlar");
  const audits = rows.filter((row) => row.module === "Denetim Yönetimi");
  const todayTime = dateValue(today);

  const items: ControlAssuranceItem[] = controls.map((control) => {
    const reference = clean(control.data.controlRef || control.code || control.id);
    const aliases = new Set([control.id, control.code, control.data.controlRef, control.data.controlTitle].map(key).filter(Boolean));
    const linkedEvidence = evidence.filter((row) => aliases.has(key(row.data.controlRef)));
    const linkedAudits = audits.filter((row) =>
      [row.data.controlRef, row.data.requirementRef].some((value) => aliases.has(key(value))),
    );
    const currentEvidence = linkedEvidence.filter((row) => {
      const expired = includes(row.data.status, ["süresi doldu", "expired", "reddedildi", "rejected"]);
      const expiresAt = dateValue(row.data.expiresAt);
      return !expired && (!Number.isFinite(expiresAt) || expiresAt >= todayTime);
    });
    const nextTestDate = clean(control.data.nextTestDate);
    const nextTestTime = dateValue(nextTestDate);
    const testOverdue = Number.isFinite(nextTestTime) && nextTestTime < todayTime;
    const reasons: string[] = [];
    let score = 100;
    if (!clean(control.data.owner)) { score -= 15; reasons.push("owner-missing"); }
    if (!clean(control.data.testOwner)) { score -= 10; reasons.push("test-owner-missing"); }
    if (!nextTestDate) { score -= 15; reasons.push("test-date-missing"); }
    else if (testOverdue) { score -= 30; reasons.push("test-overdue"); }
    if (!linkedEvidence.length) { score -= 35; reasons.push("evidence-missing"); }
    else if (!currentEvidence.length) { score -= 25; reasons.push("evidence-stale"); }
    if (!linkedAudits.length) { score -= 10; reasons.push("audit-missing"); }
    if (includes(control.data.status, ["iyileştirme gerekli", "needs improvement", "devre dışı", "inactive"])) {
      score -= 20;
      reasons.push("control-needs-improvement");
    }
    score = Math.max(0, score);
    return {
      control,
      reference,
      title: clean(control.data.controlTitle || control.data.title || reference),
      owner: clean(control.data.owner),
      evidenceCount: linkedEvidence.length,
      currentEvidenceCount: currentEvidence.length,
      auditCount: linkedAudits.length,
      nextTestDate,
      testOverdue,
      score,
      state: score >= 80 ? "healthy" : score >= 50 ? "attention" : "critical",
      reasons,
    };
  });

  items.sort((a, b) => a.score - b.score || a.reference.localeCompare(b.reference, "tr"));
  const healthy = items.filter((item) => item.state === "healthy").length;
  const currentEvidence = items.filter((item) => item.currentEvidenceCount > 0).length;
  const overdueTests = items.filter((item) => item.testOverdue).length;
  const score = items.length ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : 100;
  return { items, total: items.length, healthy, currentEvidence, overdueTests, score };
}
