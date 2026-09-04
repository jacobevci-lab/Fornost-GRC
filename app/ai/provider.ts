import { cleanAiText } from "./security";
import type { AiProviderKind } from "./storage";

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiProviderConfig = {
  provider: AiProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature: number;
  timeoutMs: number;
  maxTokens: number;
};

function openAiUrl(baseUrl: string, suffix: "/models" | "/chat/completions") {
  const base = baseUrl.replace(/\/+$/, "");
  if (/\/v1$/i.test(base)) return `${base}${suffix}`;
  return `${base}/v1${suffix}`;
}

function ollamaUrl(baseUrl: string, suffix: "/api/tags" | "/api/chat") {
  return `${baseUrl.replace(/\/+$/, "")}${suffix}`;
}

function authHeaders(apiKey = "") {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

async function boundedJson(response: Response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > 4 * 1024 * 1024) throw new Error("AI sağlayıcısı izin verilen yanıt boyutunu aştı.");
  const text = await response.text();
  if (text.length > 4 * 1024 * 1024) throw new Error("AI sağlayıcısı izin verilen yanıt boyutunu aştı.");
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("AI sağlayıcısı geçerli JSON döndürmedi.");
  }
}

async function request(url: string, init: RequestInit, timeoutMs: number) {
  return fetch(url, {
    ...init,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json", ...(init.headers || {}) },
  });
}

export async function callAiProvider(config: AiProviderConfig, messages: AiMessage[]) {
  if (config.provider === "ollama") {
    const response = await request(ollamaUrl(config.baseUrl, "/api/chat"), {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(config.apiKey) },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        options: { temperature: config.temperature, num_predict: config.maxTokens },
      }),
    }, config.timeoutMs);
    const payload = await boundedJson(response);
    if (!response.ok) throw new Error(`Local AI isteği başarısız (${response.status}).`);
    const message = payload.message as Record<string, unknown> | undefined;
    const content = cleanAiText(message?.content, 20_000);
    if (!content) throw new Error("Local AI boş yanıt döndürdü.");
    return content;
  }

  const response = await request(openAiUrl(config.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(config.apiKey) },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: false,
    }),
  }, config.timeoutMs);
  const payload = await boundedJson(response);
  if (!response.ok) throw new Error(`AI sağlayıcısı isteği başarısız (${response.status}).`);
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = cleanAiText(message?.content, 20_000);
  if (!content) throw new Error("AI sağlayıcısı boş yanıt döndürdü.");
  return content;
}

export async function testAiProvider(config: AiProviderConfig) {
  const url = config.provider === "ollama" ? ollamaUrl(config.baseUrl, "/api/tags") : openAiUrl(config.baseUrl, "/models");
  const response = await request(url, { headers: authHeaders(config.apiKey) }, Math.min(config.timeoutMs, 15_000));
  if (response.ok) {
    await boundedJson(response);
    return config.provider === "ollama"
      ? "Ollama bağlantısı ve model servisi erişimi doğrulandı."
      : "OpenAI-compatible bağlantı ve model servisi erişimi doğrulandı.";
  }
  if (config.provider === "openai-compatible" && [404, 405].includes(response.status)) {
    const reply = await callAiProvider({ ...config, maxTokens: 8 }, [
      { role: "system", content: "Connection test. Reply only OK." },
      { role: "user", content: "OK" },
    ]);
    if (reply) return "OpenAI-compatible sohbet uç noktası doğrulandı.";
  }
  throw new Error(`AI bağlantı testi başarısız (${response.status}).`);
}
