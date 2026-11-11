import { safeHttpUrl } from "../api/integrations/security";

export const ticketProviders = [
  { id: "jira", name: "Jira Cloud" },
  { id: "jira-dc", name: "Jira Data Center" },
  { id: "servicenow", name: "ServiceNow" },
  { id: "azure-devops", name: "Azure DevOps Boards" },
  { id: "github-issues", name: "GitHub Issues" },
  { id: "webhook", name: "Webhook" },
] as const;
export type TicketProvider = typeof ticketProviders[number]["id"];
export type TicketConfig = Record<string, string | boolean>;
export type Connection = { id: string; provider: string; enabled: boolean; config: TicketConfig; hasSecret: boolean; updated_at: string; updated_by?: string };
export type ConnectionHealth = { status?: string; testedAt?: string; detail?: string };
type Field = { key: string; tr: string; en: string; placeholder?: string };
export const accessFields: Record<string, Field[]> = {
  jira: [{ key: "baseUrl", tr: "Jira adresi", en: "Jira URL", placeholder: "https://example.atlassian.net" }, { key: "username", tr: "Servis hesabı e-postası", en: "Service account email" }],
  "jira-dc": [{ key: "baseUrl", tr: "Jira Data Center adresi", en: "Jira Data Center URL", placeholder: "https://jira.example.com" }],
  servicenow: [{ key: "baseUrl", tr: "ServiceNow adresi", en: "ServiceNow URL", placeholder: "https://example.service-now.com" }, { key: "username", tr: "Servis hesabı", en: "Service account" }],
  "azure-devops": [{ key: "organization", tr: "Organizasyon", en: "Organization" }],
  "github-issues": [],
  webhook: [{ key: "endpoint", tr: "Webhook adresi", en: "Webhook URL", placeholder: "https://example.com/grc" }],
};
export const targetFields: Record<string, Field[]> = {
  jira: [{ key: "projectKey", tr: "Proje anahtarı", en: "Project key", placeholder: "SEC" }, { key: "issueType", tr: "İş kaydı türü", en: "Issue type", placeholder: "Task" }],
  "jira-dc": [{ key: "projectKey", tr: "Proje anahtarı", en: "Project key", placeholder: "SEC" }, { key: "issueType", tr: "İş kaydı türü", en: "Issue type", placeholder: "Task" }],
  servicenow: [{ key: "table", tr: "Hedef tablo", en: "Target table", placeholder: "incident" }],
  "azure-devops": [{ key: "project", tr: "Proje", en: "Project" }, { key: "workItemType", tr: "İş öğesi türü", en: "Work item type", placeholder: "Task" }],
  "github-issues": [{ key: "repository", tr: "Depo", en: "Repository", placeholder: "organization/repository" }],
  webhook: [],
};
export const providerName = (id: string) => ticketProviders.find(p => p.id === id)?.name || id;
export function ticketDefaults(provider: string): TicketConfig {
  if (provider === "jira" || provider === "jira-dc") return { issueType: "Task" };
  if (provider === "servicenow") return { table: "incident" };
  if (provider === "azure-devops") return { workItemType: "Task" };
  return {};
}
export function ticketConfigError(provider: string, config: TicketConfig, hasSecret: boolean, tr = true, allowPrivate = false) {
  if (!ticketProviders.some(p => p.id === provider)) return tr ? "Sağlayıcı desteklenmiyor." : "Unsupported provider.";
  for (const field of [...accessFields[provider], ...targetFields[provider]]) {
    if (!String(config[field.key] || "").trim()) return `${tr ? field.tr : field.en}: ${tr ? "zorunlu alan" : "required field"}.`;
  }
  if (["jira", "jira-dc", "servicenow", "webhook"].includes(provider) && !safeHttpUrl(config.baseUrl || config.endpoint, allowPrivate))
    return tr ? "Geçerli ve izin verilen bir HTTPS adresi girin." : "Enter a valid, permitted HTTPS URL.";
  if (provider === "github-issues" && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(config.repository || ""))) return tr ? "Depo organization/repository biçiminde olmalı." : "Use organization/repository format.";
  if (provider === "servicenow" && !/^[A-Za-z][A-Za-z0-9_]*$/.test(String(config.table || ""))) return tr ? "Hedef tablo adı geçersiz." : "Invalid target table name.";
  if (!hasSecret) return tr ? "API anahtarı gerekli." : "An API key is required.";
  return "";
}
export function connectionState(row: Connection | undefined, health: ConnectionHealth | undefined, available: boolean, now = Date.now()) {
  if (!available) return "unknown";
  if (!row) return "empty";
  if (!row.enabled) return "paused";
  if (health?.status === "error") return "error";
  const time = Date.parse(health?.testedAt || "");
  if (health?.status !== "success" || !Number.isFinite(time) || time > now + 60_000) return "untested";
  return now - time > 7 * 86400_000 ? "stale" : "verified";
}
