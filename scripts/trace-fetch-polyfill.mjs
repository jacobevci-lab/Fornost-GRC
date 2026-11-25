import http from "node:http";
import https from "node:https";

const nativeFetch = globalThis.fetch.bind(globalThis);

function rawTrace(input, init = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const client = target.protocol === "https:" ? https : http;
    const headers = new Headers(init.headers || (typeof input === "object" && input?.headers ? input.headers : undefined));
    const request = client.request(target, {
      method: "TRACE",
      headers: Object.fromEntries(headers.entries()),
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) for (const item of value) responseHeaders.append(name, item);
          else if (value != null) responseHeaders.set(name, String(value));
        }
        resolve(new Response(body, {
          status: response.statusCode || 500,
          statusText: response.statusMessage || "",
          headers: responseHeaders,
        }));
      });
    });
    request.on("error", reject);
    if (init.body != null) request.write(init.body);
    request.end();
  });
}

globalThis.fetch = async (input, init = {}) => {
  const method = String(init.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
  if (method === "TRACE") return rawTrace(input, init);
  return nativeFetch(input, init);
};
