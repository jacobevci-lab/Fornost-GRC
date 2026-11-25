export type KnowledgeHealthSource = {
  status: "draft" | "approved" | "archived";
  classification: string;
  characterCount: number;
  chunkCount: number;
  approvedAt: string | null;
  reviewDueAt?: string | null;
};

export type KnowledgeHealthState = "healthy" | "review" | "stale" | "archived";

const STALE_AFTER_DAYS = 180;

export function knowledgeHealthState(source: KnowledgeHealthSource, now = Date.now()): KnowledgeHealthState {
  if (source.status === "archived") return "archived";
  if (source.status === "draft" || !source.approvedAt) return "review";
  if (source.reviewDueAt) {
    const reviewDueAt = Date.parse(`${source.reviewDueAt}T23:59:59.999Z`);
    return Number.isFinite(reviewDueAt) && now > reviewDueAt ? "stale" : "healthy";
  }
  const approvedAt = Date.parse(source.approvedAt);
  if (!Number.isFinite(approvedAt)) return "review";
  return now - approvedAt > STALE_AFTER_DAYS * 86_400_000 ? "stale" : "healthy";
}

export function summarizeKnowledgeHealth(sources: KnowledgeHealthSource[], now = Date.now()) {
  return sources.reduce((summary, source) => {
    summary.total += 1;
    summary.characters += Math.max(0, Number(source.characterCount) || 0);
    summary.chunks += Math.max(0, Number(source.chunkCount) || 0);
    if (source.status === "approved") summary.approved += 1;
    if (source.status === "draft") summary.review += 1;
    if (source.status === "archived") summary.archived += 1;
    if (source.classification === "Restricted") summary.restricted += 1;
    if (knowledgeHealthState(source, now) === "stale") summary.stale += 1;
    return summary;
  }, { total: 0, approved: 0, review: 0, stale: 0, archived: 0, restricted: 0, characters: 0, chunks: 0 });
}
