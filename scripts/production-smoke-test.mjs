const baseUrl = (process.env.FORNOST_PROD_URL || "https://fornost-grc.ykpevci.workers.dev").replace(/\/$/, "");
const accessClientId = process.env.CF_ACCESS_CLIENT_ID || "";
const accessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";
const smokeEmail = process.env.FORNOST_SMOKE_EMAIL || "";
const smokePassword = process.env.FORNOST_SMOKE_PASSWORD || "";

const baseHeaders = {
  "user-agent": "fornost-production-smoke-test/1.0",
  accept: "application/json,text/html;q=0.9,*/*;q=0.8",
};

if (accessClientId && accessClientSecret) {
  baseHeaders["CF-Access-Client-Id"] = accessClientId;
  baseHeaders["CF-Access-Client-Secret"] = accessClientSecret;
}

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    redirect: "manual",
    ...options,
    headers: { ...baseHeaders, ...(options.headers || {}) },
  });
  const text = await response.text();
  return { url, response, text };
}

async function jsonRequest(path, method, body, cookie = "") {
  const headers = {
    "content-type": "application/json",
    origin: baseUrl,
  };
  if (cookie) headers.cookie = cookie;
  return request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function parseJson(result, label) {
  try {
    return JSON.parse(result.text);
  } catch {
    throw new Error(`${label} did not return JSON: ${result.text.slice(0, 500)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function printResult(name, status, detail = "") {
  console.log(`${status ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function sessionCookie(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  const session = cookies.find((value) => value.startsWith("fornost_session="));
  return session ? session.split(";", 1)[0] : "";
}

function futureDate(days = 30) {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

async function authenticatedCrudTest() {
  if (!smokeEmail && !smokePassword) {
    console.warn("SKIP  Authenticated Asset/Risk CRUD — FORNOST_SMOKE_EMAIL and FORNOST_SMOKE_PASSWORD are not configured.");
    return;
  }
  assert(smokeEmail && smokePassword, "Both FORNOST_SMOKE_EMAIL and FORNOST_SMOKE_PASSWORD must be configured together.");

  let cookie = "";
  let assetId = "";
  let riskId = "";

  const cleanup = async () => {
    if (!cookie) return;
    for (const id of [riskId, assetId]) {
      if (!id) continue;
      try {
        const result = await jsonRequest(`/api/grc?id=${encodeURIComponent(id)}`, "DELETE", undefined, cookie);
        if (result.response.status !== 200 && result.response.status !== 404) {
          console.warn(`WARN  Cleanup failed for ${id}: HTTP ${result.response.status}`);
        }
      } catch (error) {
        console.warn(`WARN  Cleanup failed for ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try {
      await jsonRequest("/api/auth", "POST", { action: "logout" }, cookie);
    } catch {
      // Session expiry is non-fatal after cleanup.
    }
  };

  try {
    const login = await jsonRequest("/api/auth", "POST", {
      action: "login",
      email: smokeEmail,
      password: smokePassword,
    });
    assert(login.response.status === 200, `Smoke-test login failed with HTTP ${login.response.status}: ${login.text.slice(0, 300)}`);
    cookie = sessionCookie(login.response);
    assert(cookie, "Smoke-test login succeeded but no fornost_session cookie was returned.");
    printResult("Dedicated smoke-test login", true);

    const auth = await request("/api/auth", { headers: { cookie } });
    assert(auth.response.status === 200, `Authenticated session check failed with HTTP ${auth.response.status}`);
    const authPayload = parseJson(auth, "Authenticated session check");
    assert(authPayload?.authenticated === true, "Smoke-test session is not authenticated.");
    assert(authPayload?.user?.role === "Admin", `Smoke-test identity must have Admin role for cleanup; got ${authPayload?.user?.role || "unknown"}.`);
    printResult("Authenticated session", true, `role=${authPayload.user.role}`);

    const marker = `SMOKE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const assetTitle = `${marker} Asset`;
    const assetCreate = await jsonRequest("/api/grc", "POST", {
      module: "Varlık Envanteri",
      data: {
        title: assetTitle,
        assetType: "Server",
        businessUnit: "Synthetic Monitoring",
        owner: "GitHub Actions",
        criticality: "Low",
        status: "Aktif",
      },
    }, cookie);
    assert(assetCreate.response.status === 201, `Asset create failed with HTTP ${assetCreate.response.status}: ${assetCreate.text.slice(0, 500)}`);
    const assetPayload = parseJson(assetCreate, "Asset create");
    assetId = String(assetPayload.id || "");
    const assetCode = String(assetPayload.code || assetId);
    assert(assetId, "Asset create returned no record id.");
    printResult("Asset create", true, assetCode);

    const riskCreate = await jsonRequest("/api/grc", "POST", {
      module: "Risk Assessment",
      data: {
        title: `${marker} Risk`,
        category: "Operational",
        businessUnit: "Synthetic Monitoring",
        owner: "GitHub Actions",
        asset: assetCode,
        inherentLikelihood: 1,
        inherentImpact: 1,
        treatment: "Mitigate",
        status: "Açık",
        nextReview: futureDate(30),
      },
    }, cookie);
    assert(riskCreate.response.status === 201, `Risk create failed with HTTP ${riskCreate.response.status}: ${riskCreate.text.slice(0, 500)}`);
    const riskPayload = parseJson(riskCreate, "Risk create");
    riskId = String(riskPayload.id || "");
    assert(riskId, "Risk create returned no record id.");
    printResult("Risk create", true, String(riskPayload.code || riskId));

    const list = await request("/api/grc", { headers: { cookie, origin: baseUrl } });
    assert(list.response.status === 200, `GRC read failed with HTTP ${list.response.status}: ${list.text.slice(0, 500)}`);
    const listPayload = parseJson(list, "GRC read");
    const rows = Array.isArray(listPayload?.rows) ? listPayload.rows : [];
    const asset = rows.find((row) => row.id === assetId);
    const risk = rows.find((row) => row.id === riskId);
    assert(asset && risk, "Synthetic Asset/Risk records were not returned by the production read path.");
    const riskData = JSON.parse(String(risk.data_json || "{}"));
    assert(riskData.asset === assetCode, `Risk/Asset relationship did not persist; expected ${assetCode}, got ${String(riskData.asset || "")}.`);
    printResult("D1 persistence + Asset/Risk relationship", true);

    const updatedRiskData = {
      ...riskData,
      status: "Değerlendiriliyor",
    };
    const update = await jsonRequest("/api/grc", "PATCH", { id: riskId, data: updatedRiskData }, cookie);
    assert(update.response.status === 200, `Risk update failed with HTTP ${update.response.status}: ${update.text.slice(0, 500)}`);
    printResult("Risk update", true);

    const afterUpdate = await request("/api/grc", { headers: { cookie, origin: baseUrl } });
    assert(afterUpdate.response.status === 200, `Post-update read failed with HTTP ${afterUpdate.response.status}`);
    const afterUpdatePayload = parseJson(afterUpdate, "Post-update read");
    const updatedRisk = (afterUpdatePayload.rows || []).find((row) => row.id === riskId);
    assert(updatedRisk, "Updated risk disappeared from production read path.");
    const updatedData = JSON.parse(String(updatedRisk.data_json || "{}"));
    assert(updatedData.status === "Değerlendiriliyor", `Risk update did not persist; got ${String(updatedData.status || "")}.`);
    printResult("Risk update persistence", true);

    const createdRiskId = riskId;
    const createdAssetId = assetId;

    const deleteRisk = await jsonRequest(`/api/grc?id=${encodeURIComponent(createdRiskId)}`, "DELETE", undefined, cookie);
    assert(deleteRisk.response.status === 200, `Risk cleanup failed with HTTP ${deleteRisk.response.status}: ${deleteRisk.text.slice(0, 500)}`);
    riskId = "";

    const deleteAsset = await jsonRequest(`/api/grc?id=${encodeURIComponent(createdAssetId)}`, "DELETE", undefined, cookie);
    assert(deleteAsset.response.status === 200, `Asset cleanup failed with HTTP ${deleteAsset.response.status}: ${deleteAsset.text.slice(0, 500)}`);
    assetId = "";

    const afterDelete = await request("/api/grc", { headers: { cookie, origin: baseUrl } });
    assert(afterDelete.response.status === 200, `Post-cleanup read failed with HTTP ${afterDelete.response.status}`);
    const afterDeletePayload = parseJson(afterDelete, "Post-cleanup read");
    const remaining = Array.isArray(afterDeletePayload?.rows)
      ? afterDeletePayload.rows.filter((row) => row.id === createdRiskId || row.id === createdAssetId)
      : [];
    assert(remaining.length === 0, "Synthetic records still exist after cleanup.");
    printResult("Synthetic record cleanup", true);
  } finally {
    await cleanup();
  }
}

async function run() {
  console.log(`Fornost production smoke test: ${baseUrl}`);
  console.log(`Cloudflare Access headers: ${accessClientId && accessClientSecret ? "enabled" : "not configured"}`);

  const root = await request("/");
  const rootOk = root.response.status === 200;
  printResult("Root endpoint reachable", rootOk, `HTTP ${root.response.status}`);
  assert(rootOk, `Root endpoint failed with HTTP ${root.response.status}. If Cloudflare Access protects production, configure the service-token secrets.`);

  const health = await request("/api/health");
  const healthOk = health.response.status === 200;
  printResult("Health endpoint reachable", healthOk, `HTTP ${health.response.status}`);
  assert(healthOk, `Health endpoint failed with HTTP ${health.response.status}: ${health.text.slice(0, 500)}`);

  const payload = parseJson(health, "Health endpoint");
  assert(payload?.status === "ok", `Health status is not ok: ${JSON.stringify(payload)}`);
  printResult("Application health", true, payload.status);

  assert(payload?.checks?.database?.ok === true, `D1 health check failed: ${JSON.stringify(payload?.checks?.database)}`);
  printResult("D1 connectivity", true);

  assert(payload?.checks?.bucket?.ok === true, `R2 health check failed: ${JSON.stringify(payload?.checks?.bucket)}`);
  printResult("R2 connectivity", true);

  const securityHeaders = ["x-content-type-options", "referrer-policy"];
  const missingHeaders = securityHeaders.filter((name) => !root.response.headers.get(name));
  if (missingHeaders.length === 0) {
    printResult("Baseline security headers", true);
  } else {
    console.warn(`WARN  Baseline security headers missing: ${missingHeaders.join(", ")}`);
  }

  await authenticatedCrudTest();
  console.log("Production smoke test completed successfully.");
}

run().catch((error) => {
  console.error(`\nProduction smoke test failed: ${error.message}`);
  process.exit(1);
});
