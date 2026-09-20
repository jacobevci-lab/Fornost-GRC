const baseUrl = (process.env.FORNOST_PROD_URL || "https://fornost-grc.ykpevci.workers.dev").replace(/\/$/, "");
const accessClientId = process.env.CF_ACCESS_CLIENT_ID || "";
const accessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";

const headers = {
  "user-agent": "fornost-production-smoke-test/1.0",
  accept: "application/json,text/html;q=0.9,*/*;q=0.8",
};

if (accessClientId && accessClientSecret) {
  headers["CF-Access-Client-Id"] = accessClientId;
  headers["CF-Access-Client-Secret"] = accessClientSecret;
}

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    redirect: "manual",
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });

  const text = await response.text();
  return { url, response, text };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function printResult(name, status, detail = "") {
  console.log(`${status ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function run() {
  console.log(`Fornost production smoke test: ${baseUrl}`);
  console.log(`Cloudflare Access headers: ${accessClientId && accessClientSecret ? "enabled" : "not configured"}`);

  const root = await request("/");
  const rootOk = root.response.status >= 200 && root.response.status < 400;
  printResult("Root endpoint reachable", rootOk, `HTTP ${root.response.status}`);
  assert(rootOk, `Root endpoint failed with HTTP ${root.response.status}`);

  const health = await request("/api/health");
  const healthOk = health.response.status === 200;
  printResult("Health endpoint reachable", healthOk, `HTTP ${health.response.status}`);
  assert(healthOk, `Health endpoint failed with HTTP ${health.response.status}: ${health.text.slice(0, 500)}`);

  let payload;
  try {
    payload = JSON.parse(health.text);
  } catch {
    throw new Error(`Health endpoint did not return JSON: ${health.text.slice(0, 500)}`);
  }

  assert(payload?.status === "ok", `Health status is not ok: ${JSON.stringify(payload)}`);
  printResult("Application health", true, payload.status);

  assert(payload?.checks?.database?.ok === true, `D1 health check failed: ${JSON.stringify(payload?.checks?.database)}`);
  printResult("D1 connectivity", true, payload.checks.database.detail || "ok");

  assert(payload?.checks?.bucket?.ok === true, `R2 health check failed: ${JSON.stringify(payload?.checks?.bucket)}`);
  printResult("R2 connectivity", true, payload.checks.bucket.detail || "ok");

  const securityHeaders = [
    "x-content-type-options",
    "referrer-policy",
  ];
  const missingHeaders = securityHeaders.filter((name) => !root.response.headers.get(name));
  if (missingHeaders.length === 0) {
    printResult("Baseline security headers", true);
  } else {
    console.warn(`WARN  Baseline security headers missing: ${missingHeaders.join(", ")}`);
  }

  console.log("Production smoke test completed successfully.");
}

run().catch((error) => {
  console.error(`\nProduction smoke test failed: ${error.message}`);
  process.exit(1);
});
