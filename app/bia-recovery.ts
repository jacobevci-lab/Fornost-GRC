/** Zero hours is a valid recovery objective; absent/invalid targets are not. */
export function hasRecoveryTarget(value: unknown): boolean {
  return (typeof value === "number" || (typeof value === "string" && value.trim() !== ""))
    && Number.isFinite(Number(value)) && Number(value) >= 0;
}
