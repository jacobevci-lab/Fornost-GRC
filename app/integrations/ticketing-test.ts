import { safeHttpUrl } from "../api/integrations/security";
import { ticketConfigError, type TicketConfig } from "./ticketing-config";

export type TargetCheck = { name: string; status: "passed" | "limited"; detail: string };
/** Read-only checks. Never creates a work item as part of a connection test. */
export async function testTicketConnection(provider: string, config: TicketConfig, secret: string, allowPrivate: boolean, fetcher: typeof fetch = fetch) {
  const invalid = ticketConfigError(provider, config, Boolean(secret), true, allowPrivate);
  if (invalid) throw new Error(invalid);
  const checks: TargetCheck[] = [];
  const basic = (user: string) => "Basic " + btoa(user + ":" + secret);
  async function read(url: string, authorization: string) {
    const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(8_000), headers: { accept: "application/json", authorization, "user-agent": "Fornost-GRC" } });
    if (!response.ok) throw new Error("Erişim kontrolü başarısız / Access check failed (" + response.status + ").");
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Sağlayıcı yanıtı doğrulanamadı / Provider response could not be verified.");
    return data;
  }
  const base = (safeHttpUrl(config.baseUrl || config.endpoint, allowPrivate) || "").replace(/\/+$/, "");
  if (provider === "jira" || provider === "jira-dc") {
    const root = base + (provider === "jira" ? "/rest/api/3" : "/rest/api/2");
    const auth = provider === "jira" ? basic(String(config.username)) : "Bearer " + secret;
    await read(root + "/myself", auth);
    checks.push({ name: "account", status: "passed", detail: "Account access verified" });
    const project = encodeURIComponent(String(config.projectKey));
    const permissions = await read(root + "/mypermissions?projectKey=" + project + "&permissions=BROWSE_PROJECTS,CREATE_ISSUES", auth);
    if (permissions.permissions?.BROWSE_PROJECTS?.havePermission !== true || permissions.permissions?.CREATE_ISSUES?.havePermission !== true)
      throw new Error("Proje erişimi veya iş kaydı oluşturma yetkisi eksik / Project access or Create Issues permission is missing.");
    checks.push({ name: "project", status: "passed", detail: "Browse Projects and Create Issues verified" });
    checks.push({ name: "fields", status: "limited", detail: "Issue type, custom required fields and workflow validators are evaluated when creating a work item." });
  } else if (provider === "github-issues") {
    const repo = await read("https://api.github.com/repos/" + String(config.repository), "Bearer " + secret);
    if (repo.has_issues !== true || repo.archived === true) throw new Error("Depoda Issues kapalı veya depo arşivlenmiş / Issues are disabled or the repository is archived.");
    checks.push({ name: "repository", status: "passed", detail: "Repository is accessible and Issues are enabled" });
    checks.push({ name: "write", status: "limited", detail: "Issue write permission has not been verified." });
  } else if (provider === "azure-devops") {
    await read("https://dev.azure.com/" + encodeURIComponent(String(config.organization)) + "/_apis/projects/" + encodeURIComponent(String(config.project)) + "?api-version=7.1", basic(""));
    checks.push({ name: "project", status: "passed", detail: "Target project is accessible" });
    checks.push({ name: "write", status: "limited", detail: "Work item write permission has not been verified." });
  } else if (provider === "servicenow") {
    await read(base + "/api/now/table/" + encodeURIComponent(String(config.table)) + "?sysparm_limit=1&sysparm_fields=sys_id", basic(String(config.username)));
    checks.push({ name: "table", status: "passed", detail: "Target table can be read" });
    checks.push({ name: "write", status: "limited", detail: "Table insert permission has not been verified." });
  } else {
    const response = await fetcher(base, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(8_000), headers: { authorization: "Bearer " + secret } });
    if (!response.ok) throw new Error("Webhook erişimi doğrulanamadı / Webhook reachability check failed (" + response.status + "). HEAD isteği desteklenmeli / HEAD must be supported.");
    checks.push({ name: "endpoint", status: "limited", detail: "Endpoint responds to HEAD; POST processing has not been verified." });
  }
  return { ok: true, checks, message: "Erişim kontrolü tamamlandı; gerçek iş kaydı oluşturulmadı. / Access checks completed; no work item was created." };
}
