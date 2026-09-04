export type AiHistoryMessage = { role: "user" | "assistant"; content: string };

const SECRET_KEY_PATTERN = /(secret|password|passwd|token|api.?key|private.?key|credential|authorization|cookie|session)/i;

export function cleanAiText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

export function redactSensitiveText(value: unknown, max = 1200) {
  return cleanAiText(value, max)
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi, "[REDACTED_PRIVATE_KEY]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "Bearer [REDACTED]")
    .replace(/\bBasic\s+[A-Za-z0-9+/=]{12,}/gi, "Basic [REDACTED]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,})\b/g, "[REDACTED_TOKEN]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_JWT]")
    .replace(/\b(password|passwd|token|api[_-]?key|secret)\s*([:=])\s*[^\s,;]+/gi, "$1$2[REDACTED]");
}

export function envFlag(env: Record<string, unknown>, key: string) {
  return ["1", "true", "yes", "on"].includes(String(env[key] ?? "").trim().toLowerCase());
}

function normalizeHost(input: string) {
  return input.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function ipv4Parts(host: string) {
  const parts = host.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function nonPublicIpv4(parts: number[]) {
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 0 && (parts[2] === 0 || parts[2] === 2)) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || parts[1] === 51)) ||
    (parts[0] === 203 && parts[1] === 0 && parts[2] === 113);
}

export function isLoopbackHost(input: string) {
  const host = normalizeHost(input);
  const parts = ipv4Parts(host);
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0:0:0:0:0:0:0:1" || !!(parts && parts[0] === 127);
}

export function isPrivateHost(input: string) {
  const host = normalizeHost(input);
  if (isLoopbackHost(host)) return true;
  const parts = ipv4Parts(host);
  if (parts) return nonPublicIpv4(parts);
  if (host.includes(":")) {
    if (host === "::" || host.startsWith("::ffff:")) return true;
    return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:") || host.startsWith("ff") || host.startsWith("2001:db8:");
  }
  return !host.includes(".") || host.endsWith(".internal") || host.endsWith(".local") || host.endsWith(".lan");
}

export function isForbiddenAiHost(input: string) {
  const host = normalizeHost(input);
  const parts = ipv4Parts(host);
  if (parts) return parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || parts[0] >= 224;
  if (host.includes(":")) return host === "::" || host.startsWith("fe80:") || host.startsWith("ff");
  return host === "metadata.google.internal";
}

export function safeAiEndpoint(value: unknown, allowPrivate = false, allowLoopback = false) {
  const input = cleanAiText(value, 2048);
  if (!input) return null;
  try {
    const parsed = new URL(input);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password || parsed.hash || parsed.search || parsed.port === "0") return null;
    const host = normalizeHost(parsed.hostname);
    if (!host || isForbiddenAiHost(host)) return null;
    const loopback = isLoopbackHost(host);
    const privateHost = isPrivateHost(host);
    if (loopback && !allowLoopback) return null;
    if (privateHost && !allowPrivate) return null;
    if (parsed.protocol === "http:" && !(allowPrivate && privateHost)) return null;
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function sanitizeAiRecord(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth-limited]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactSensitiveText(value, 1200);
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeAiRecord(item, depth + 1));
  if (!value || typeof value !== "object") return String(value ?? "").slice(0, 200);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 80)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    output[key.slice(0, 80)] = sanitizeAiRecord(item, depth + 1);
  }
  return output;
}

export function sanitizeHistory(value: unknown): AiHistoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const role = (item as Record<string, unknown>).role;
    const content = redactSensitiveText((item as Record<string, unknown>).content, 2000);
    if ((role !== "user" && role !== "assistant") || !content) return [];
    return [{ role, content } as AiHistoryMessage];
  });
}

export function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
