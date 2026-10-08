export type AssuranceQueueContext='full'|'without-capa'|'work-only';
export function validAssuranceQueueContext(value:unknown):value is AssuranceQueueContext {
 return value==='full'||value==='without-capa'||value==='work-only';
}
// Only known legacy schema gaps justify a reduced read. Operational errors must surface.
export function missingAssuranceContextTable(error:unknown):boolean {
 const message=error instanceof Error?error.message:String(error);
 return /\bno such table:\s*(?:main\.)?(?:enterprise_findings|evidence_automation_findings|evidence_automation_rules)(?=[:\s]|$)/i.test(message);
}
