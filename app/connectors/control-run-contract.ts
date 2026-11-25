import type { ControlAssessment } from './control-templates';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const identity = (value: unknown, max = 120): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function parseControlRunId(value: string | null): string | null {
  if (value === null) return null;
  if (!identity(value, 80)) throw new Error('Invalid run identity.');
  return value;
}

/** Validate historical diagnostics without re-evaluating them against today's template. */
export function validControlAssessment(value: unknown): value is ControlAssessment {
  if (!object(value) || !identity(value.templateId) || !count(value.templateVersion) || value.templateVersion < 1 || value.scope !== 'credential-visible' || !timestamp(value.evaluatedAt)) return false;
  const {total, passed, failed, unknown, score, issues, issuesTruncated} = value;
  if (!count(total) || !count(passed) || !count(failed) || !count(unknown) || !count(score) || total !== passed + failed + unknown || score !== (total ? Math.floor(100 * passed / total) : 0)) return false;
  if (value.status !== (failed ? 'fail' : total && !unknown ? 'pass' : 'error') || !Array.isArray(issues) || issuesTruncated !== (failed + unknown > 100)) return false;
  if (!issues.every(item => object(item) && ['id', 'name', 'reason'].every(key => typeof item[key] === 'string' && item[key].length <= 160) && ['fail', 'unknown'].includes(item.status as string))) return false;
  if (!total) return issues.length === 1 && issues[0].status === 'unknown' && issues[0].reason === 'no-data';
  if (issues.length !== Math.min(failed + unknown, 100)) return false;
  const shownFailed = issues.filter(item => item.status === 'fail').length, shownUnknown = issues.length - shownFailed;
  return issuesTruncated ? shownFailed <= failed && shownUnknown <= unknown : shownFailed === failed && shownUnknown === unknown;
}

export type ControlRunRecord = {
  id: string; ruleId: string; ruleName: string; sourceName: string;
  status: 'pass' | 'fail' | 'error'; score: number; detail: string;
  createdAt: string; triggerType: string; durationMs: number; errorCode: string | null;
  evidenceId: string | null; evidenceState: 'available' | 'missing' | 'none';
  assessment: ControlAssessment | null;
};

export function validControlRun(value: unknown, runId: string, expectedRuleId?: string): value is ControlRunRecord {
  if (!object(value) || value.id !== runId || !identity(value.id, 80) || !identity(value.ruleId) || (expectedRuleId !== undefined && value.ruleId !== expectedRuleId)) return false;
  if (!['ruleName', 'sourceName', 'detail', 'triggerType'].every(key => typeof value[key] === 'string') || !timestamp(value.createdAt) || !count(value.durationMs) || !count(value.score) || value.score > 100 || !['pass', 'fail', 'error'].includes(value.status as string)) return false;
  if (value.errorCode !== null && typeof value.errorCode !== 'string') return false;
  if (value.evidenceId === null) { if (value.evidenceState !== 'none') return false; }
  else if (!identity(value.evidenceId) || !['available', 'missing'].includes(value.evidenceState as string)) return false;
  return value.assessment === null || (validControlAssessment(value.assessment) && value.assessment.status === value.status && value.assessment.score === value.score);
}
