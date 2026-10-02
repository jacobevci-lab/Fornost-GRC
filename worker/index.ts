/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {runScheduledAssuranceOperations} from "../app/assurance-scheduled-runtime";

interface Env extends Record<string, unknown> {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://static.cloudflareinsights.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; worker-src 'self' blob:; frame-src 'self' blob:; media-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
};

function hardenResponse(response: Response): Response {
  if (response.status === 101) return response;

  const html = response.headers.get("content-type")?.includes("text/html") === true;
  const nonce = html ? btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))) : "";
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // File downloads can intentionally carry a stricter CSP; never loosen it.
    if (name === "Content-Security-Policy" && headers.has(name)) continue;
    headers.set(name, name === "Content-Security-Policy" && nonce
      ? value.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`) : value);
  }

  const hardened = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  if (!html) return hardened;
  // Streaming SSR emits inline hydration scripts. Authorize those individually
  // instead of permitting every inline script in the page.
  hardened.headers.set("cache-control", "private, no-store");
  return new HTMLRewriter().on("script", {
    element(element) { element.setAttribute("nonce", nonce); },
  }).transform(hardened);
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return hardenResponse(response);
    }

    const response = await handler.fetch(request, env, ctx);
    return hardenResponse(response);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const runAt = new Date(controller.scheduledTime);
    ctx.waitUntil(runScheduledAssuranceOperations(env.DB, env, runAt).catch((error) => {
      console.error("Scheduled assurance operations failed", error instanceof Error ? error.message : "unknown error");
    }));
  },
};

export default worker;