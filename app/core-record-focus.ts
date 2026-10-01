import { legacyModuleName } from "./domain-identity";
import type { FornostNavigationRequest } from "./navigation-focus";

export const CORE_RECORD_MODULES = new Set(["Risk Assessment", "BIA", "Varlık Envanteri", "Uyum", "Kontroller", "Kanıtlar", "Denetim Yönetimi"]);
export type FocusableRecord = { id: string; module: string; code?: string; data: Record<string, unknown> };
const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();

export function isCoreRecordRequest(request: FornostNavigationRequest): boolean {
  return CORE_RECORD_MODULES.has(legacyModuleName(request.module) || request.module)
    && (request.kind === "record" || request.source === "connected-grc-register" || request.source === "my-work");
}
export function coreRecordReference(request: FornostNavigationRequest): string {
  return clean(request.filter?.recordRef || request.filter?.riskRef || request.filter?.controlRef || request.filter?.evidenceRef || request.ref);
}
/** Resolve IDs first, then unique public codes; never guess from title substrings. */
export function resolveCoreRecord<T extends FocusableRecord>(rows: T[], request: FornostNavigationRequest): T | null {
  if (!isCoreRecordRequest(request)) return null;
  const moduleName = legacyModuleName(request.module) || request.module;
  const ref = coreRecordReference(request);
  if (!ref) return null;
  const scoped = rows.filter(row => row.module === moduleName);
  const byId = scoped.filter(row => clean(row.id) === ref);
  if (byId.length === 1) return byId[0];
  const byCode = scoped.filter(row => clean(row.code) === ref);
  return byCode.length === 1 ? byCode[0] : null;
}
