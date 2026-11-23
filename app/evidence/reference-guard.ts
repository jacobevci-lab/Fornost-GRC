import { coreWriteGuard, CoreReferenceUnavailable } from "../core-reference-write";
import { LifecycleConflict } from "../enterprise-lifecycle-write";

export function evidenceReferenceGuard(id: string, data: Record<string, unknown>, before: Record<string, unknown> = {}) {
  // The singular relation accepts canonical controls/compliance requirements;
  // apply it to every token, preserving supported framework/free-text labels.
  return coreWriteGuard("Kanıtlar",[{id,data:{...data,controlRefs:undefined,controlRef:data.controlRefs||data.controlRef},
    before:{...before,controlRefs:undefined,controlRef:before.controlRefs||before.controlRef}}]);
}

export async function evidenceClaimConflict(db: D1Database, guard: ReturnType<typeof evidenceReferenceGuard>) {
  if (!await db.prepare(`SELECT 1 valid WHERE ${guard.sql}`).bind(...guard.values).first()) return new CoreReferenceUnavailable();
  return new LifecycleConflict();
}
