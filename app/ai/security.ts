export type AiHistoryMessage = { role: "user" | "assistant"; content: string };

const SECRET_KEY_PATTERN = /(secret|password|passwd|token|api.?key|private.?key|credential|authorization|cookie|session)/i;

export function cleanAiText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

export function envFlag(env: Record<string, unknown>, key: string) {
  return ["1", "true", "yes", "on"].includes(String(env[key] ?? "").trim().toLowerCase());
}

function ipv4Parts(host: string) {
  const parts = host.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

export function isLoopbackHost(input: string) {
  const host = input.toLowerCase().replace(/^\[|\]$/g, "");
  const parts = ipv4Parts(host);
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0:0:0:0:0:0:0:1" || !!(parts && parts[0] === 127);
}

export function isPrivateHost(input: string) {
  const host = input.toLowerCase().replace(/^\[|\]$/g, "");
  if (isLoopbackHost(host)) return true;
  const parts = ipv4Parts(host);
  if (parts) {
    return parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
  }
  if (host.includes(":")) return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
  return !host.includes(".") || host.endsWith(".internal") || host.endsWith(".local") || host.endsWith(".lan");
}

export function safeAiEndpoint(value: unknown, allowPrivate = false, allowLoopback = false) {
  const input = cleanAiText(value, 2048);
  if (!input) return null;
  try {
    const parsed = new URL(input);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password || parsed.hash || parsed.port === "0") return null;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host) return null;
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
  if (typeof value === "string") return cleanAiText(value, 1200);
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
    const content = cleanAiText((item as Record<string, unknown>).content, 2000);
    if ((role !== "user" && role !== "assistant") || !content) return [];
    return [{ role, content } as AiHistoryMessage];
  });
}

export function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
