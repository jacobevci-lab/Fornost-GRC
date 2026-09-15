export type DossierDomain = {
  key: string;
  label: string;
  records: number;
  current: number;
  state: "ready" | "attention" | "missing";
  latestAt: string | null;
  references: string[];
};

export function dossierWindow(value: unknown) {
  const days = Number(value || 90);
  if (![30, 90, 365].includes(days))
    throw new Error("Denetim dönemi 30, 90 veya 365 gün olmalıdır.");
  return days as 30 | 90 | 365;
}

export function dossierDomain(input: {
  key: string;
  label: string;
  rows: Record<string, unknown>[];
  current: (row: Record<string, unknown>) => boolean;
  dateKey: string;
}): DossierDomain {
  const current = input.rows.filter(input.current).length;
  return {
    key: input.key,
    label: input.label,
    records: input.rows.length,
    current,
    state: current > 0 ? "ready" : input.rows.length ? "attention" : "missing",
    latestAt: input.rows.length ? String(input.rows[0][input.dateKey] || "") || null : null,
    references: input.rows.slice(0, 50).map((row) => String(row.id)),
  };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return `{${Object.keys(item)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(item[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function sha256Json(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
