import type { AutomationRule, AutomationSource } from "../evidence-automation";

export const queueGroups = ["failed", "verify", "current", "paused"] as const;
export type QueueGroup = typeof queueGroups[number];

// This is presentation priority, not a replacement for the assurance assessment.
export function controlQueueGroup(rule: AutomationRule, source?: AutomationSource): QueueGroup {
  if (!rule.enabled) return "paused";
  if (rule.lastStatus === "fail") return "failed";
  if (rule.lastStatus !== "pass" || rule.freshness !== "fresh" || !source?.enabled ||
      !rule.lastRunId || !rule.lastEvidenceAt || rule.evidenceRunId !== rule.lastRunId) return "verify";
  return "current";
}

export function filterQueueRules(rules: AutomationRule[], sources: AutomationSource[], query: string, owner: string, filter: string, lang: "tr" | "en") {
  const byId = new Map(sources.map(source => [source.id, source]));
  const term = query.normalize("NFKC").trim().toLocaleLowerCase(lang);
  return rules.filter(rule => {
    const source = byId.get(rule.sourceId);
    const group = controlQueueGroup(rule, source);
    const ownerValue = rule.remediationOwner?.trim() || "";
    return (!term || [rule.name, rule.id, rule.controlRefs, source?.name, source?.vendor, rule.sourceId, ownerValue].join(" ").normalize("NFKC").toLocaleLowerCase(lang).includes(term)) &&
      (!owner || (owner === "unassigned" ? !ownerValue : owner === `owner:${ownerValue}`)) &&
      (filter === "all" || (filter === "attention" ? group === "failed" || group === "verify" : rule.enabled && rule.freshness === "fresh"));
  }).sort((a, b) => queueGroups.indexOf(controlQueueGroup(a, byId.get(a.sourceId))) - queueGroups.indexOf(controlQueueGroup(b, byId.get(b.sourceId))) || a.name.localeCompare(b.name, lang) || a.id.localeCompare(b.id));
}
