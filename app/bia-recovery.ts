/** Zero hours is a valid recovery objective; absent/invalid targets are not. */
export function hasRecoveryTarget(value: unknown): boolean {
  return (typeof value === "number" || (typeof value === "string" && value.trim() !== ""))
    && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export function recoveryHoursLabel(value:unknown,tr:boolean) {
  if (!hasRecoveryTarget(value)) return "—";
  const hours=Number(value);
  const unit=tr?"saat":hours===1?"hour":"hours";
  return hours.toLocaleString(tr?"tr-TR":"en-GB",{maximumFractionDigits:20})+" "+unit;
}
