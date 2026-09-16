export const CONTROL_SCHEDULES = ["hourly", "daily", "weekly", "monthly"] as const;
export type ControlSchedule = typeof CONTROL_SCHEDULES[number];

const scheduleMs: Record<ControlSchedule, number> = {
  hourly: 60 * 60_000,
  daily: 24 * 60 * 60_000,
  weekly: 7 * 24 * 60 * 60_000,
  monthly: 30 * 24 * 60 * 60_000,
};

export type ContinuousControlInput = {
  schedule: string;
  freshnessHours: unknown;
  failureThreshold: unknown;
  remediationDueDays: unknown;
  autoFinding: unknown;
};

export function validateContinuousControl(input: ContinuousControlInput) {
  if (!CONTROL_SCHEDULES.includes(input.schedule as ControlSchedule)) throw new Error("Geçersiz kontrol zamanlaması.");
  const freshnessHours = Number(input.freshnessHours || 24);
  const failureThreshold = Number(input.failureThreshold || 1);
  const remediationDueDays = Number(input.remediationDueDays || 7);
  if (!Number.isInteger(freshnessHours) || freshnessHours < 1 || freshnessHours > 8760) throw new Error("Kanıt tazeliği 1-8760 saat arasında olmalı.");
  if (!Number.isInteger(failureThreshold) || failureThreshold < 1 || failureThreshold > 20) throw new Error("Hata eşiği 1-20 arasında olmalı.");
  if (!Number.isInteger(remediationDueDays) || remediationDueDays < 1 || remediationDueDays > 365) throw new Error("Düzeltme süresi 1-365 gün arasında olmalı.");
  return { freshnessHours, failureThreshold, remediationDueDays, autoFinding: input.autoFinding !== false && input.autoFinding !== 0 };
}

export function nextControlRun(schedule: string, from = new Date()) {
  const delay = scheduleMs[schedule as ControlSchedule];
  if (!delay) throw new Error("Geçersiz kontrol zamanlaması.");
  return new Date(from.getTime() + delay).toISOString();
}

export function evidenceFreshness(lastEvidenceAt: string | null | undefined, freshnessHours: number, now = new Date()) {
  if (!lastEvidenceAt) return "missing" as const;
  const age = now.getTime() - new Date(lastEvidenceAt).getTime();
  if (!Number.isFinite(age) || age < 0) return "unknown" as const;
  if (age > freshnessHours * 60 * 60_000) return "stale" as const;
  if (age > freshnessHours * 60 * 60_000 * .8) return "expiring" as const;
  return "fresh" as const;
}

export function controlHealth(input:{enabled:boolean;lastStatus?:string|null;lastEvidenceAt?:string|null;freshnessHours:number;consecutiveFailures:number},now=new Date()){
  if(!input.enabled)return "paused" as const;
  if(input.consecutiveFailures>0||input.lastStatus==="fail"||input.lastStatus==="error")return "failing" as const;
  const freshness=evidenceFreshness(input.lastEvidenceAt,input.freshnessHours,now);
  return freshness==="fresh"?"healthy":freshness;
}

export function remediationDueDate(days:number,from=new Date()){
  return new Date(from.getTime()+days*24*60*60_000).toISOString().slice(0,10);
}
