const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const integrationProviders = [
  "jira", "servicenow", "azure-devops", "github-issues", "webhook",
  "smtp-bridge", "microsoft-graph-mail", "email-api",
  "entra-oidc", "okta-oidc", "generic-oidc", "saml", "ldap", "ldaps",
] as const;

export type IntegrationProvider = (typeof integrationProviders)[number];

export function clean(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function validProvider(value: unknown): value is IntegrationProvider {
  return typeof value === "string" && integrationProviders.includes(value as IntegrationProvider);
}

function privateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || parts[0] >= 224 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || parts[1] === 51)) ||
    (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}

export function safeHttpUrl(value: unknown, allowPrivate = false): string | null {
  const input = clean(value, 2048);
  if (!input) return null;
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "https:" && !(allowPrivate && parsed.protocol === "http:")) return null;
    if (parsed.username || parsed.password || parsed.port === "0") return null;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0:0:0:0:0:0:0:1") return null;
    if (!allowPrivate && (privateIpv4(host) || host.includes(":") || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:"))) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

async function encryptionKey(secret: string) {
  if (secret.length < 32) throw new Error("FORNOST_SETTINGS_ENCRYPTION_KEY en az 32 karakter olmalıdır.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string, keyMaterial: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(keyMaterial), encoder.encode(value));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string | null, keyMaterial: string) {
  if (!value) return "";
  const [version, iv, payload] = value.split(".");
  if (version !== "v1" || !iv || !payload) throw new Error("Şifreli entegrasyon sırrı geçersiz.");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(keyMaterial), base64ToBytes(payload));
  return decoder.decode(decrypted);
}

export function safeIntegrationConfig(value: unknown): Record<string, string | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, string | boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key)) continue;
    if (/(secret|password|token|api.?key|private.?key|credential)/i.test(key)) continue;
    if (typeof item === "boolean") output[key] = item;
    else if (typeof item === "string") output[key] = clean(item, 2048);
  }
  return output;
}
