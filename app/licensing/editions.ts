export const editions = ["Essentials", "Professional", "Enterprise"] as const;
export type Edition = typeof editions[number];
export type LicenseAccess = { active: Edition | null; archive: Edition | null };
export function includesEdition(edition: Edition | null, required: Edition) {
  return edition !== null && editions.indexOf(edition) >= editions.indexOf(required);
}

const professional = new Set(["Tedarikçiler", "Risk İştahı ve KRI", "İş Sürekliliği", "AI Ayarları", "Ask Fornost", "Denetim Yönetimi", "Bulgular ve CAPA"]);
const enterprise = new Set(["Bağlantılı GRC", "Kanıt Otomasyonu", "AI Yönetişimi"]);
export function moduleEdition(module: string): Edition {
  if (enterprise.has(module)) return "Enterprise";
  return professional.has(module) ? "Professional" : "Essentials";
}
export function recoveryModule(module: string) {
  return ["Ana Sayfa", "Kimlik ve Erişim", "Sistem Ayarları"].includes(module);
}

// Recovery and account administration remain available even after expiry.
const basicRoutes = new Set(["catalogs", "controls", "dashboard-preferences", "evidence", "framework-posture", "grc", "incidents", "integrations", "policy-lifecycle", "record-links", "records", "regulatory-intelligence", "search", "views", "workflow-choices"]);

export function apiEdition(path: string): Edition | "recovery" | "unknown" {
  const [, , root, section] = path.replace(/\/+$/, "").split("/");
  if (["license", "auth", "settings", "users", "identity", "health"].includes(root)) return "recovery";
  if (["/api/ai/status","/api/ai/chat","/api/ai/providers"].includes(path.replace(/\/+$/, ""))) return "Professional";
  if (["evidence-automation", "continuous-assurance", "connected-grc", "executive-assurance", "executive-metrics", "ai"].includes(root)
    || root === "controls" && section === "assurance" || root === "evidence" && (section === "assurance" || section === "usage")
    || root === "grc" && section === "demo") return "Enterprise";
  if (["audits", "third-party-risk", "risk-appetite", "continuity", "findings"].includes(root)
    || root === "evidence" && section === "followups") return "Professional";
  return basicRoutes.has(root) ? "Essentials" : "unknown";
}

export function apiLicensed(access: LicenseAccess, path: string, method: string) {
  const required = apiEdition(path);
  if (required === "unknown") return false;
  if (required === "recovery" || includesEdition(access.active, required)) return true;
  // Only historical records and exports remain readable. Live analyses, tests
  // and actions (including read-like POST requests) require the active tier.
  const historical = /^\/api\/(grc|search|record-links|evidence(?:\/history)?|audits(?:\/(?:requests|reports|workpapers|milestones|plan))?|third-party-risk|continuity|risk-appetite|findings(?:\/history)?)\/?$/.test(path);
  return (method === "GET" || method === "HEAD") && historical && includesEdition(access.archive, required);
}
