import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { decryptSecret, encryptSecret } from "../../integrations/security";
import { boundedNumber, cleanAiText, envFlag, safeAiEndpoint } from "@/app/ai/security";
import { aiRuntime, getAiSettings, recordAiEvent, type AiProviderKind } from "@/app/ai/storage";
import { testAiProvider, type AiProviderConfig } from "@/app/ai/provider";

const providers: AiProviderKind[] = ["openai-compatible", "ollama"];
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
const bodyTooLarge = (req: NextRequest) => Number(req.headers.get("content-length") || 0) > 32_768;
const envText = (env: Record<string, unknown>, key: string) => String(env[key] ?? "").trim();

function parseConfig(configJson: string) {
  try {
    const parsed = JSON.parse(configJson || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function providerConfig(row: NonNullable<Awaited<ReturnType<typeof getAiSettings>>>, apiKey: string): AiProviderConfig {
  const config = parseConfig(row.config_json);
  return {
    provider: row.provider,
    baseUrl: row.base_url,
    model: row.model,
    apiKey,
    temperature: boundedNumber(config.temperature, 0.2, 0, 2),
    timeoutMs: boundedNumber(config.timeoutMs, 60_000, 5_000, 120_000),
    maxTokens: Math.round(boundedNumber(config.maxTokens, 1200, 128, 4096)),
  };
}

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const env = await aiRuntime(), row = await getAiSettings(env.DB);
  if (!row) return json({ configured: false, provider: "openai-compatible", baseUrl: "", model: "", enabled: false, temperature: 0.2, timeoutMs: 60000, maxTokens: 1200, hasSecret: false });
  const config = parseConfig(row.config_json);
  return json({
    configured: true,
    provider: row.provider,
    baseUrl: row.base_url,
    model: row.model,
    enabled: !!row.enabled,
    temperature: boundedNumber(config.temperature, 0.2, 0, 2),
    timeoutMs: boundedNumber(config.timeoutMs, 60_000, 5_000, 120_000),
    maxTokens: Math.round(boundedNumber(config.maxTokens, 1200, 128, 4096)),
    hasSecret: !!row.secret_ciphertext,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  });
}

export async function PUT(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  if (bodyTooLarge(req)) return json({ error: "İstek boyutu çok büyük." }, 413);
  const body = await req.json().catch(() => ({}));
  const provider = cleanAiText(body.provider, 40) as AiProviderKind;
  if (!providers.includes(provider)) return json({ error: "Desteklenmeyen AI sağlayıcısı." }, 400);
  const env = await aiRuntime();
  const allowPrivate = envFlag(env, "FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS");
  const allowLoopback = envFlag(env, "FORNOST_AI_ALLOW_LOOPBACK");
  const baseUrl = safeAiEndpoint(body.baseUrl, allowPrivate, allowLoopback);
  if (!baseUrl) return json({ error: "AI endpoint adresi güvenlik politikasına uygun değil. On-prem private/loopback erişimi environment ayarlarıyla açıkça etkinleştirilmelidir." }, 400);
  const model = cleanAiText(body.model, 200);
  if (!model) return json({ error: "Model adı gerekli." }, 400);
  const temperature = boundedNumber(body.temperature, 0.2, 0, 2);
  const timeoutMs = Math.round(boundedNumber(body.timeoutMs, 60_000, 5_000, 120_000));
  const maxTokens = Math.round(boundedNumber(body.maxTokens, 1200, 128, 4096));
  const enabled = body.enabled === true;
  const secret = cleanAiText(body.secret, 4096);
  const existing = await getAiSettings(env.DB);
  const encryptionKey = envText(env, "FORNOST_SETTINGS_ENCRYPTION_KEY");
  if (secret && encryptionKey.length < 32) return json({ error: "AI API anahtarını saklamak için FORNOST_SETTINGS_ENCRYPTION_KEY en az 32 karakter olmalıdır." }, 503);
  const encrypted = secret ? await encryptSecret(secret, encryptionKey) : existing?.secret_ciphertext || null;
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO ai_provider_settings(id,provider,base_url,model,enabled,config_json,secret_ciphertext,created_at,updated_at,updated_by)
    VALUES('default',?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,base_url=excluded.base_url,model=excluded.model,enabled=excluded.enabled,config_json=excluded.config_json,secret_ciphertext=excluded.secret_ciphertext,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(provider, baseUrl, model, enabled ? 1 : 0, JSON.stringify({ temperature, timeoutMs, maxTokens }), encrypted, existing?.created_at || now, now, access.actor.email).run();
  await recordAiEvent(env.DB, { actor: access.actor.email, action: "provider-save", provider, model, status: "success", detail: enabled ? "AI provider enabled" : "AI provider saved disabled" });
  return json({ ok: true, enabled, hasSecret: !!encrypted });
}

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const env = await aiRuntime(), row = await getAiSettings(env.DB);
  if (!row) return json({ error: "Önce AI sağlayıcısını yapılandırın." }, 409);
  const allowPrivate = envFlag(env, "FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS");
  const allowLoopback = envFlag(env, "FORNOST_AI_ALLOW_LOOPBACK");
  const safeBaseUrl = safeAiEndpoint(row.base_url, allowPrivate, allowLoopback);
  if (!safeBaseUrl) return json({ error: "Kayıtlı AI endpoint mevcut environment güvenlik politikasıyla kullanılamıyor." }, 409);
  let apiKey = "";
  if (row.secret_ciphertext) {
    const key = envText(env, "FORNOST_SETTINGS_ENCRYPTION_KEY");
    if (key.length < 32) return json({ error: "AI API anahtarını çözmek için encryption key yapılandırılmamış." }, 503);
    apiKey = await decryptSecret(row.secret_ciphertext, key);
  }
  const started = Date.now();
  try {
    const message = await testAiProvider({ ...providerConfig(row, apiKey), baseUrl: safeBaseUrl });
    await recordAiEvent(env.DB, { actor: access.actor.email, action: "provider-test", provider: row.provider, model: row.model, status: "success", latencyMs: Date.now() - started, detail: message });
    return json({ ok: true, message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI bağlantı testi başarısız.";
    await recordAiEvent(env.DB, { actor: access.actor.email, action: "provider-test", provider: row.provider, model: row.model, status: "error", latencyMs: Date.now() - started, detail: message });
    return json({ error: message }, 502);
  }
}
