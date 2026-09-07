import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { encryptSecret } from "../../integrations/security";
import { boundedNumber, cleanAiText, envFlag, safeAiEndpoint } from "@/app/ai/security";
import { aiRuntime, getAiSettings, recordAiEvent, type AiProviderKind, type AiSettingsRow } from "@/app/ai/storage";
import { testAiProvider } from "@/app/ai/provider";
import { getAiProviderChain } from "@/app/ai/runtime-provider";

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

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const env = await aiRuntime(), row = await getAiSettings(env.DB), fallback=await env.DB.prepare("SELECT * FROM ai_provider_fallbacks WHERE id='default'").first<AiSettingsRow>();
  if (!row) return json({ configured: false, provider: "openai-compatible", baseUrl: "", model: "", enabled: false, temperature: 0.2, timeoutMs: 60000, maxTokens: 1200, hasSecret: false, fallback:{provider:"ollama",baseUrl:"",model:"",enabled:false,hasSecret:false} });
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
    fallback:fallback?{provider:fallback.provider,baseUrl:fallback.base_url,model:fallback.model,enabled:!!fallback.enabled,hasSecret:!!fallback.secret_ciphertext}: {provider:"ollama",baseUrl:"",model:"",enabled:false,hasSecret:false},
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
  const existingFallback=await env.DB.prepare("SELECT * FROM ai_provider_fallbacks WHERE id='default'").first<AiSettingsRow>();
  const encryptionKey = envText(env, "FORNOST_SETTINGS_ENCRYPTION_KEY");
  if (secret && encryptionKey.length < 32) return json({ error: "AI API anahtarını saklamak için FORNOST_SETTINGS_ENCRYPTION_KEY en az 32 karakter olmalıdır." }, 503);
  const fallbackProvided=!!body.fallback&&typeof body.fallback==="object"&&!Array.isArray(body.fallback);
  const fallbackBody=fallbackProvided?body.fallback as Record<string,unknown>:{};
  const fallbackEnabled=fallbackProvided?fallbackBody.enabled===true:!!existingFallback?.enabled;
  const fallbackProvider=(fallbackProvided?cleanAiText(fallbackBody.provider,40):existingFallback?.provider||"ollama") as AiProviderKind;
  const fallbackModel=fallbackProvided?cleanAiText(fallbackBody.model,200):existingFallback?.model||"";
  if(fallbackEnabled&&!providers.includes(fallbackProvider))return json({error:"Yedek AI sağlayıcısı geçersiz."},400);
  const fallbackUrlInput=fallbackProvided?fallbackBody.baseUrl:existingFallback?.base_url||"";
  const fallbackBaseUrl=fallbackEnabled?safeAiEndpoint(fallbackUrlInput,allowPrivate,allowLoopback):cleanAiText(fallbackUrlInput,1500);
  if(fallbackEnabled&&(!fallbackBaseUrl||!fallbackModel))return json({error:"Etkin yedek sağlayıcı için güvenli endpoint ve model gereklidir."},400);
  const fallbackSecret=cleanAiText(fallbackBody.secret,4096);
  if(fallbackSecret&&encryptionKey.length<32)return json({error:"Yedek AI API anahtarı için encryption key yapılandırılmamış."},503);
  const encrypted = secret
    ? await encryptSecret(secret, encryptionKey)
    : existing?.provider === provider
      ? existing.secret_ciphertext
      : null;
  const fallbackEncrypted=fallbackSecret?await encryptSecret(fallbackSecret,encryptionKey):existingFallback?.provider===fallbackProvider?existingFallback.secret_ciphertext:null;
  const now = new Date().toISOString();
  await env.DB.batch([env.DB.prepare(`INSERT INTO ai_provider_settings(id,provider,base_url,model,enabled,config_json,secret_ciphertext,created_at,updated_at,updated_by)
    VALUES('default',?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,base_url=excluded.base_url,model=excluded.model,enabled=excluded.enabled,config_json=excluded.config_json,secret_ciphertext=excluded.secret_ciphertext,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(provider, baseUrl, model, enabled ? 1 : 0, JSON.stringify({ temperature, timeoutMs, maxTokens }), encrypted, existing?.created_at || now, now, access.actor.email),env.DB.prepare(`INSERT INTO ai_provider_fallbacks(id,provider,base_url,model,enabled,config_json,secret_ciphertext,created_at,updated_at,updated_by) VALUES('default',?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,base_url=excluded.base_url,model=excluded.model,enabled=excluded.enabled,config_json=excluded.config_json,secret_ciphertext=excluded.secret_ciphertext,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(fallbackProvider||"ollama",fallbackBaseUrl||"",fallbackModel||"",fallbackEnabled?1:0,JSON.stringify({temperature,timeoutMs,maxTokens}),fallbackEncrypted,existingFallback?.created_at||now,now,access.actor.email)]);
  await recordAiEvent(env.DB, { actor: access.actor.email, action: "provider-save", provider, model, status: "success", detail: enabled ? "AI provider enabled" : "AI provider saved disabled" });
  return json({ ok: true, enabled, hasSecret: !!encrypted, fallbackHasSecret:!!fallbackEncrypted });
}

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const env = await aiRuntime(), row = await getAiSettings(env.DB);
  if (!row) return json({ error: "Önce AI sağlayıcısını yapılandırın." }, 409);
  const started = Date.now();
  try {
    const chain=await getAiProviderChain(env,row),tests=[];
    for(const item of chain){const itemStarted=Date.now();try{const result=await testAiProvider(item);tests.push({profile:item.profile,provider:item.provider,model:item.model,ok:true,...result});await env.DB.prepare("INSERT INTO ai_provider_health(id,profile,provider,model,operation,status,latency_ms,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),item.profile,item.provider,item.model,"connection-test","success",Date.now()-itemStarted,result.message,new Date().toISOString()).run();}catch(error){const message=error instanceof Error?error.message:"Bağlantı başarısız.";tests.push({profile:item.profile,provider:item.provider,model:item.model,ok:false,message,models:[],selectedModelAvailable:null});await env.DB.prepare("INSERT INTO ai_provider_health(id,profile,provider,model,operation,status,latency_ms,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),item.profile,item.provider,item.model,"connection-test","error",Date.now()-itemStarted,message,new Date().toISOString()).run();}}
    const primary=tests[0];await recordAiEvent(env.DB, { actor: access.actor.email, action: "provider-test", provider: row.provider, model: row.model, status: tests.every(item=>item.ok)?"success":"error", latencyMs: Date.now() - started, detail: `${tests.filter(item=>item.ok).length}/${tests.length} provider profiles healthy` });
    return json({ ok: tests.every(item=>item.ok), message:tests.every(item=>item.ok)?"AI sağlayıcı zinciri doğrulandı.":"Sağlayıcı zincirinde başarısız profil var.", models:primary.models,selectedModelAvailable:primary.selectedModelAvailable,tests },tests.every(item=>item.ok)?200:502);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI bağlantı testi başarısız.";
    await recordAiEvent(env.DB, { actor: access.actor.email, action: "provider-test", provider: row.provider, model: row.model, status: "error", latencyMs: Date.now() - started, detail: message });
    return json({ error: message }, 502);
  }
}
