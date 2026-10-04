export function sessionRevocationTarget(body: Record<string, unknown>): string | null {
  return Object.keys(body).length === 1 && typeof body.userId === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(body.userId) ? body.userId : null;
}
export function isSessionRevocationEvent(afterJson: string | undefined): boolean {
  try { return JSON.parse(afterJson || "null")?.operation === "revoke-local-sessions"; }
  catch { return false; }
}
