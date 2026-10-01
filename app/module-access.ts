/** Optional, installation-local access boundaries. Roles remain the upper limit. */
export const ACCESS_MODULES = ["Risk Assessment", "BIA", "Varlık Envanteri", "Uyum", "Tedarikçiler", "Kontroller", "Kanıtlar", "Denetim Yönetimi"] as const;
export type AccessModule = typeof ACCESS_MODULES[number];
export type ModuleGrant = "read" | "write";
export type ModuleAccess = { mode: "full" } | { mode: "scoped"; modules: Partial<Record<AccessModule, ModuleGrant>> };
export type AccessSubject = { role: string; moduleAccess?: ModuleAccess };
export const FULL_ACCESS: ModuleAccess = { mode: "full" };
export const NO_ACCESS: ModuleAccess = { mode: "scoped", modules: {} };

export function validateModuleAccess(value: unknown): ModuleAccess | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.mode === "full" && Object.keys(input).every(key => key === "mode")) return { mode: "full" };
  if (input.mode !== "scoped" || Object.keys(input).some(key => !["mode", "modules"].includes(key)) || !input.modules || typeof input.modules !== "object" || Array.isArray(input.modules)) return null;
  const modules: Partial<Record<AccessModule, ModuleGrant>> = {};
  for (const [key, grant] of Object.entries(input.modules)) {
    if (!ACCESS_MODULES.includes(key as AccessModule) || (typeof grant !== "string" || !["read", "write"].includes(grant))) return null;
    modules[key as AccessModule] = grant as ModuleGrant;
  }
  return { mode: "scoped", modules };
}

// A missing row preserves existing installations; corrupt persisted policy fails closed.
export function parseModuleAccess(raw: string | null | undefined): ModuleAccess {
  if (raw === undefined || raw === null) return FULL_ACCESS;
  try { return validateModuleAccess(JSON.parse(raw)) || NO_ACCESS; } catch { return NO_ACCESS; }
}
export function isScoped(subject: AccessSubject) { return subject.role !== "Admin" && subject.moduleAccess?.mode === "scoped"; }
export function canReadModule(subject: AccessSubject, module: string) {
  return !isScoped(subject) || (ACCESS_MODULES.includes(module as AccessModule) && !!(subject.moduleAccess as Extract<ModuleAccess, { mode: "scoped" }>).modules[module as AccessModule]);
}
export function canWriteModule(subject: AccessSubject, module: string) {
  return ["Admin", "Editor"].includes(subject.role) && (!isScoped(subject) || (subject.moduleAccess as Extract<ModuleAccess, { mode: "scoped" }>).modules[module as AccessModule] === "write");
}
export function readableModules(subject: AccessSubject) { return ACCESS_MODULES.filter(module => canReadModule(subject, module)); }
export function canOpenModule(subject: AccessSubject, module: string) {
  if (!isScoped(subject)) return true;
  return module === "Ana Sayfa" || module === "Ask Fornost" || (ACCESS_MODULES.includes(module as AccessModule) && canReadModule(subject, module));
}

/** Closed allowlist: shared enterprise reports/workflows are not scoped datasets. */
export function scopedApiAllowed(subject: AccessSubject, pathname: string, method: string) {
  if (!isScoped(subject)) return true;
  const path = pathname.replace(/\/+$/, ""), read = method === "GET" || method === "HEAD";
  if (path === "/api/grc") return true; // Row/module authorization is inside the handler.
  if (path === "/api/catalogs") return read; // Shared field choices, no business records.
  if (path === "/api/ai/status" || path === "/api/ai/source-target") return read;
  if (path === "/api/ai/chat") return method === "POST";
  const module = path === "/api/audits" ? "Denetim Yönetimi" : ["/api/evidence", "/api/evidence/history"].includes(path) ? "Kanıtlar" : null;
  return !!module && (read ? canReadModule(subject, module) : canWriteModule(subject, module));
}
