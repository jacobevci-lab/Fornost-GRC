import { mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(root);
if (!existsSync("dist/server/wrangler.json")) throw new Error("Missing production build");
const runtime = resolve(root, ".sites-runtime");
for (const dir of ["data", "home", "tmp", "npm-cache", "xdg-config", "wrangler/logs"]) {
  mkdirSync(resolve(runtime, dir), { recursive: true });
}
const env = { ...process.env,
  HOME: resolve(runtime, "home"), TMPDIR: resolve(runtime, "tmp"),
  XDG_CONFIG_HOME: resolve(runtime, "xdg-config"),
  WRANGLER_WRITE_LOGS: "false", WRANGLER_LOG_PATH: resolve(runtime, "wrangler/logs"),
  MINIFLARE_REGISTRY_PATH: resolve(runtime, "wrangler/registry"),
  npm_config_cache: resolve(runtime, "npm-cache"), WRANGLER_SEND_METRICS: "false",
};
// The container receives secrets from the installer. Never silently use public
// development keys in a production image.
for (const name of ["FORNOST_SETTINGS_ENCRYPTION_KEY", "FORNOST_DOSSIER_SIGNING_KEY"]) {
  if (!env[name] || env[name].length < 32 || env[name].startsWith("development-only-")) {
    throw new Error(`A production ${name} of at least 32 characters is required`);
  }
}
const args = ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json",
  "--ip", env.HOST || "0.0.0.0", "--port", env.PORT || "3000", "--inspector-port", "0",
  "--local", "--persist-to", resolve(runtime, "data"), "--show-interactive-dev-session=false"];
for (const [key, fallback] of Object.entries({
  FORNOST_DEMO_MODE: "false", FORNOST_SETTINGS_ENCRYPTION_KEY: "", FORNOST_DOSSIER_SIGNING_KEY: "",
  FORNOST_SCHEDULER_TOKEN: "", FORNOST_ALLOW_PRIVATE_CONNECTORS: "false",
  FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS: "false", FORNOST_AI_ALLOW_LOOPBACK: "false",
  FORNOST_TRUST_PLATFORM_IDENTITY: "false",
})) args.push("--var", `${key}:${env[key] || fallback}`);
const child = spawn(process.execPath, args, { env, stdio: "inherit" });
let stopping = false;
let timer;
let active;
const stop = (signal) => {
  stopping = true; clearTimeout(timer); active?.abort(); child.kill(signal);
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
child.on("error", () => { console.error("Application runtime failed to start"); process.exitCode = 1; stop("SIGTERM"); });
child.on("exit", (code, signal) => {
  stopping = true; clearTimeout(timer); active?.abort();
  process.exitCode = code ?? (signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1);
});
const token = env.FORNOST_SCHEDULER_TOKEN || "";
const configured = Number(env.FORNOST_SCHEDULER_INTERVAL_SECONDS || 300);
const interval = Number.isInteger(configured) && configured >= 60 && configured <= 3600 ? configured : 300;
async function runDue() {
  if (stopping) return;
  active = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${env.PORT || 3000}${env.NEXT_PUBLIC_BASE_PATH ?? "/fornost-grc"}/api/evidence-automation`, {
      method: "POST", redirect: "error",
      headers: { "content-type": "application/json", "x-fornost-scheduler-token": token },
      body: JSON.stringify({ action: "run-due" }),
      signal: AbortSignal.any([active.signal, AbortSignal.timeout(240000)]),
    });
    await response.body?.cancel();
    if (!response.ok) console.error(`Scheduled assurance returned HTTP ${response.status}`);
  } catch { if (!stopping) console.error("Scheduled assurance request failed"); }
  finally { active = undefined; if (!stopping) timer = setTimeout(runDue, interval * 1000); }
}
if (token.length >= 32) timer = setTimeout(runDue, 30000);
