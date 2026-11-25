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

const base64Url = (value: ArrayBuffer) => {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/"),
    padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4),
    binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function hmacKey(secret: string, usage: KeyUsage[]) {
  if (secret.trim().length < 32)
    throw new Error("FORNOST_DOSSIER_SIGNING_KEY en az 32 karakter olmalıdır.");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

export async function dossierSigningKeyId(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return `fornost-hmac-${Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function signDossierDigest(digest: string, secret: string) {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Geçerli SHA-256 özeti zorunludur.");
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, ["sign"]),
    new TextEncoder().encode(digest),
  );
  return base64Url(signature);
}

export async function verifyDossierDigest(digest: string, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/.test(digest) || !/^[A-Za-z0-9_-]{40,100}$/.test(signature)) return false;
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, ["verify"]),
      fromBase64Url(signature),
      new TextEncoder().encode(digest),
    );
  } catch {
    return false;
  }
}
