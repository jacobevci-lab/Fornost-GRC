import type { AssuranceRow } from "./control-assurance";
import { evidenceExpiryTime } from "./evidence/eligibility";
import { effectiveImpact, isRiskAssessed } from "./risk-methodology";

const DAY = 86_400_000;
export function evidenceRenewals(rows: AssuranceRow[], now: number) {
  const days = new Map<string, { day: string; overdue: boolean; rows: AssuranceRow[] }>();
  let undated = 0, later = 0, overdue = 0, upcoming = 0, total = 0;
  const horizon = (Math.floor(now / DAY) + 31) * DAY;
  for (const row of rows) {
    if (row.module !== "Kanıtlar") continue;
    total++;
    const values = [row.data.expiresAt, row.data.freshUntil].map(v => String(v ?? "").trim()).filter(Boolean);
    const deadlines = values.map(raw => ({raw, end: evidenceExpiryTime(raw)}));
    if (!deadlines.length || deadlines.some(d => !Number.isFinite(d.end))) { undated++; continue; }
    deadlines.sort((a,b) => a.end! - b.end!);
    const {raw, end} = deadlines[0];
    const calendar = raw.length === 10 ? raw : new Date(end!).toISOString().slice(0,10);
    if (Date.parse(calendar) >= horizon) { later++; continue; }
    const past = end! <= now;
    if (past) overdue++; else upcoming++;
    const key = calendar + (past ? "-past" : "-upcoming");
    const group = days.get(key) || {day:calendar, overdue:past, rows:[]};
    group.rows.push(row);
    days.set(key,group);
  }
  const all = [...days.values()].sort((a,b) => a.day.localeCompare(b.day) || Number(b.overdue)-Number(a.overdue));
  const pastDays = all.filter(d => d.overdue);
  const nextDays = all.filter(d => !d.overdue);
  const latest = pastDays.slice(-1);
  const next = nextDays.slice(0,3-latest.length);
  return {total,undated,later,overdue,upcoming,all,markers:[...pastDays.slice(Math.max(0,pastDays.length-(3-next.length))),...next].slice(-3)};
}

export function reportRiskBand(score: number) {
  return score >= 17 ? "critical" : score >= 10 ? "high" : score >= 5 ? "medium" : "low";
}
export function riskMatrixEntries(rows: AssuranceRow[]) {
  return rows.filter(row => row.module === "Risk Assessment" && isRiskAssessed(row.data)).flatMap(row => {
    const likelihood = Number(row.data.inherentLikelihood || row.data.likelihood);
    const impact = effectiveImpact(row.data);
    if (![likelihood,impact].every(value => Number.isInteger(value) && value >= 1 && value <= 5)) return [];
    return [{row,likelihood,impact,score:likelihood*impact}];
  }).sort((a,b) => b.score-a.score || a.row.id.localeCompare(b.row.id));
}
