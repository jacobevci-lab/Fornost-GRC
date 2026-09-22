import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.FORNOST_PROD_URL || "https://app.fornostsecurity.com").replace(/\/$/, "");
const cfId = process.env.CF_ACCESS_CLIENT_ID || "";
const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";
const smokeEmail = process.env.FORNOST_SMOKE_EMAIL || "";
const smokePassword = process.env.FORNOST_SMOKE_PASSWORD || "";
const outDir = path.resolve("security-artifacts/runtime");
await fs.mkdir(outDir, { recursive: true });

if (!cfId || !cfSecret) throw new Error("Cloudflare Access service-token credentials are required.");
if (!smokeEmail || !smokePassword) throw new Error("Fornost smoke credentials are required.");

const accessHeaders = {
  "CF-Access-Client-Id": cfId,
  "CF-Access-Client-Secret": cfSecret,
};
const results = [];
const findings = [];
const weight = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

function addResult(id, owasp, title, passed, detail, severity = "high", evidence = {}) {
  const item = { id, owasp, title, passed, severity, detail, evidence };
  results.push(item);
  if (!passed) findings.push(item);
}
function headersObject(headers) {
  return Object.fromEntries([...headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
}
async function request(url, options = {}) {
  const response = await fetch(url, { redirect: "manual", ...options, headers: { ...accessHeaders, ...(options.headers || {}) } });
  const text = await response.text();
  return { response, text, headers: headersObject(response.headers) };
}
function cookieFrom(setCookie) {
  return String(setCookie || "").split(";", 1)[0];
}

// A05 Security Misconfiguration: response hardening headers and CORS.
const root = await request(baseUrl);
const requiredHeaders = [
  "content-security-policy", "strict-transport-security", "x-content-type-options", "referrer-policy",
  "x-frame-options", "permissions-policy", "cross-origin-opener-policy", "cross-origin-resource-policy",
];
for (const name of requiredHeaders) addResult(`HDR-${name}`, "A05", `Security header ${name}`, Boolean(root.headers[name]), root.headers[name] || "missing", "high");
const csp = root.headers["content-security-policy"] || "";
addResult("HDR-CSP-FRAME", "A05", "CSP contains frame-ancestors", /frame-ancestors/i.test(csp), csp || "missing CSP", "medium");
addResult("HDR-HSTS", "A05", "HSTS includes includeSubDomains", /includesubdomains/i.test(root.headers["strict-transport-security"] || ""), root.headers["strict-transport-security"] || "missing", "medium");
const corsRoot = await request(baseUrl, { headers: { Origin: "https://attacker.invalid" } });
const acao = corsRoot.headers["access-control-allow-origin"] || "";
addResult("CORS-ROOT", "A01", "Hostile Origin is not trusted by root response", acao !== "*" && acao !== "https://attacker.invalid", `ACAO=${acao || "<none>"}`, "high");

// A01 Broken Access Control: API must reject anonymous and hostile-origin access.
const unauthGrc = await request(`${baseUrl}/api/grc`, { headers: { Origin: baseUrl } });
addResult("AUTHZ-ANON-GRC", "A01", "Anonymous GRC API access is denied", [401, 403].includes(unauthGrc.response.status), `HTTP ${unauthGrc.response.status}`, "critical");
const hostileLogin = await request(`${baseUrl}/api/auth`, {
  method: "POST", headers: { Origin: "https://attacker.invalid", "content-type": "application/json" },
  body: JSON.stringify({ action: "login", email: "nobody@example.invalid", password: "InvalidPassword1!" }),
});
addResult("CSRF-AUTH", "A01", "Cross-origin authentication POST is rejected", hostileLogin.response.status === 403, `HTTP ${hostileLogin.response.status}`, "high");

// A07 Identification and Authentication Failures: production auth posture.
const authState = await request(`${baseUrl}/api/auth`, { headers: { Origin: baseUrl } });
let authJson = {};
try { authJson = JSON.parse(authState.text); } catch {}
addResult("AUTH-DEMO", "A07", "Demo account is disabled in production", !authJson.demoAccount, JSON.stringify({ demoAccount: authJson.demoAccount ?? null }), "critical");
addResult("AUTH-BOOTSTRAP", "A07", "Production is not left in bootstrap-required state", authJson.bootstrapRequired === false, `bootstrapRequired=${String(authJson.bootstrapRequired)}`, "critical");
addResult("AUTH-NOSTORE", "A07", "Auth state response is non-cacheable", /no-store/i.test(authState.headers["cache-control"] || ""), authState.headers["cache-control"] || "missing", "medium");

const bad1 = await request(`${baseUrl}/api/auth`, {
  method: "POST", headers: { Origin: baseUrl, "content-type": "application/json" },
  body: JSON.stringify({ action: "login", email: "not-a-user-1@example.invalid", password: "InvalidPassword1!" }),
});
const bad2 = await request(`${baseUrl}/api/auth`, {
  method: "POST", headers: { Origin: baseUrl, "content-type": "application/json" },
  body: JSON.stringify({ action: "login", email: "not-a-user-2@example.invalid", password: "InvalidPassword2!" }),
});
addResult("AUTH-ENUM", "A07", "Unknown-user login failures are generic", bad1.response.status === 401 && bad2.response.status === 401 && bad1.text === bad2.text, `status=${bad1.response.status}/${bad2.response.status}; equalBody=${bad1.text === bad2.text}`, "high");

const sqliPayload = `x' OR '1'='1`;
const sqli = await request(`${baseUrl}/api/auth`, {
  method: "POST", headers: { Origin: baseUrl, "content-type": "application/json" },
  body: JSON.stringify({ action: "login", email: `${sqliPayload}@example.invalid`, password: sqliPayload }),
});
addResult("INJ-AUTH-SQL", "A03", "SQL-injection style credentials do not bypass authentication", sqli.response.status !== 200, `HTTP ${sqli.response.status}`, "critical");

const xssPayload = `<svg onload=alert(1337)>`;
const xss = await request(`${baseUrl}/api/auth`, {
  method: "POST", headers: { Origin: baseUrl, "content-type": "application/json" },
  body: JSON.stringify({ action: "login", email: `${xssPayload}@example.invalid`, password: "InvalidPassword1!" }),
});
addResult("INJ-AUTH-XSS", "A03", "Auth errors do not reflect raw active XSS payload", !xss.text.includes(xssPayload), `HTTP ${xss.response.status}`, "high");

const malformed = await request(`${baseUrl}/api/auth`, {
  method: "POST", headers: { Origin: baseUrl, "content-type": "application/json" }, body: "{not-json",
});
addResult("INPUT-MALFORMED-JSON", "A04", "Malformed JSON fails closed", [400, 413, 422].includes(malformed.response.status), `HTTP ${malformed.response.status}`, "medium");
const oversizedBody = JSON.stringify({ action: "login", email: "x@example.invalid", password: "A".repeat(17_000) });
const oversized = await request(`${baseUrl}/api/auth`, {
  method: "POST", headers: { Origin: baseUrl, "content-type": "application/json" }, body: oversizedBody,
});
addResult("INPUT-LIMIT", "A04", "Authentication request size is bounded", oversized.response.status === 413, `HTTP ${oversized.response.status}`, "medium");

// Valid smoke session: cookie flags, authenticated access, hostile-origin denial, logout invalidation.
const login = await request(`${baseUrl}/api/auth`, {
  method: "POST", headers: { Origin: baseUrl, "content-type": "application/json" },
  body: JSON.stringify({ action: "login", email: smokeEmail, password: smokePassword }),
});
const setCookie = login.headers["set-cookie"] || "";
addResult("AUTH-LOGIN", "A07", "Smoke account can authenticate", login.response.status === 200, `HTTP ${login.response.status}`, "critical");
addResult("COOKIE-HTTPONLY", "A07", "Session cookie is HttpOnly", /httponly/i.test(setCookie), setCookie.replace(/fornost_session=[^;]+/i, "fornost_session=<redacted>"), "high");
addResult("COOKIE-SECURE", "A07", "Session cookie is Secure", /secure/i.test(setCookie), setCookie.replace(/fornost_session=[^;]+/i, "fornost_session=<redacted>"), "high");
addResult("COOKIE-SAMESITE", "A07", "Session cookie uses SameSite=Strict", /samesite=strict/i.test(setCookie), setCookie.replace(/fornost_session=[^;]+/i, "fornost_session=<redacted>"), "high");
const cookie = cookieFrom(setCookie);

if (cookie) {
  const authGrc = await request(`${baseUrl}/api/grc`, { headers: { Origin: baseUrl, Cookie: cookie } });
  addResult("AUTHZ-AUTH-GRC", "A01", "Authenticated smoke account can read GRC API", authGrc.response.status === 200, `HTTP ${authGrc.response.status}`, "high");
  const hostileAuthGrc = await request(`${baseUrl}/api/grc`, { headers: { Origin: "https://attacker.invalid", Cookie: cookie } });
  addResult("AUTHZ-HOSTILE-GET", "A01", "Authenticated API request with hostile Origin is denied", hostileAuthGrc.response.status === 403, `HTTP ${hostileAuthGrc.response.status}`, "high");
  const hostilePost = await request(`${baseUrl}/api/grc`, {
    method: "POST", headers: { Origin: "https://attacker.invalid", Cookie: cookie, "content-type": "application/json" }, body: JSON.stringify({ module: "Risk Assessment", data: {} }),
  });
  addResult("AUTHZ-HOSTILE-POST", "A01", "Cross-origin authenticated write is denied", hostilePost.response.status === 403, `HTTP ${hostilePost.response.status}`, "critical");
  const invalidSameOriginPost = await request(`${baseUrl}/api/grc`, {
    method: "POST", headers: { Origin: baseUrl, Cookie: cookie, "content-type": "application/json" }, body: JSON.stringify({ module: "Risk Assessment", data: {} }),
  });
  addResult("INPUT-GRC-VALIDATION", "A04", "Invalid same-origin GRC record is rejected", [400, 422].includes(invalidSameOriginPost.response.status), `HTTP ${invalidSameOriginPost.response.status}`, "high");

  const hostileLogout = await request(`${baseUrl}/api/auth`, {
    method: "POST", headers: { Origin: "https://attacker.invalid", Cookie: cookie, "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }),
  });
  addResult("CSRF-LOGOUT", "A01", "Cross-origin logout is rejected", hostileLogout.response.status === 403, `HTTP ${hostileLogout.response.status}`, "medium");
  const logout = await request(`${baseUrl}/api/auth`, {
    method: "POST", headers: { Origin: baseUrl, Cookie: cookie, "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }),
  });
  addResult("AUTH-LOGOUT", "A07", "Logout succeeds", logout.response.status === 200, `HTTP ${logout.response.status}`, "high");
  const stale = await request(`${baseUrl}/api/grc`, { headers: { Origin: baseUrl, Cookie: cookie } });
  addResult("AUTH-SESSION-INVALIDATION", "A07", "Server-side session is invalid after logout", [401, 403].includes(stale.response.status), `HTTP ${stale.response.status}`, "critical");
}

// A05/A06 common exposure checks.
for (const exposedPath of ["/.env", "/.env.production", "/.git/config", "/package.json", "/wrangler.toml", "/tsconfig.json", "/server.js.map"]) {
  const res = await request(`${baseUrl}${exposedPath}`);
  addResult(`EXPOSURE-${exposedPath}`, "A05", `Sensitive deployment file is not publicly served: ${exposedPath}`, ![200, 206].includes(res.response.status), `HTTP ${res.response.status}`, "high");
}
const trace = await request(baseUrl, { method: "TRACE" });
addResult("HTTP-TRACE", "A05", "HTTP TRACE is disabled", trace.response.status !== 200, `HTTP ${trace.response.status}`, "medium");

// A09 logging/monitoring cannot be fully proven externally; prove errors are generic and do not leak stack/source paths.
const invalidAction = await request(`${baseUrl}/api/auth`, {
  method: "POST", headers: { Origin: baseUrl, "content-type": "application/json" }, body: JSON.stringify({ action: "__invalid__" }),
});
const leakPattern = /(node_modules|\/home\/|\/workspace\/|stack trace|cloudflare:workers|at\s+\w+\s*\()/i;
addResult("ERROR-DISCLOSURE", "A09", "Invalid requests do not disclose stack traces or server paths", !leakPattern.test(invalidAction.text), invalidAction.text.slice(0, 300), "high");

findings.sort((a, b) => (weight[b.severity] || 0) - (weight[a.severity] || 0));
const summary = {
  checks: results.length,
  passed: results.filter((x) => x.passed).length,
  failed: findings.length,
  bySeverity: findings.reduce((acc, item) => ({ ...acc, [item.severity]: (acc[item.severity] || 0) + 1 }), {},
  owaspCoverage: [...new Set(results.map((x) => x.owasp))].sort(),
};
const artifact = { version: "1.0", startedAt: new Date().toISOString(), baseUrl, summary, results, findings };
await fs.writeFile(path.join(outDir, "runtime-security-audit.json"), JSON.stringify(artifact, null, 2));
const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[ch]));
const rows = results.map((r) => `<tr><td>${esc(r.passed ? "PASS" : "FAIL")}</td><td>${esc(r.owasp)}</td><td>${esc(r.id)}</td><td>${esc(r.title)}</td><td>${esc(r.detail)}</td></tr>`).join("");
await fs.writeFile(path.join(outDir, "runtime-security-audit.html"), `<!doctype html><html><head><meta charset="utf-8"><title>Fornost Runtime Security Audit</title><style>body{font-family:system-ui;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#f5f5f5}</style></head><body><h1>Fornost Runtime Security Audit</h1><p>${esc(baseUrl)}</p><pre>${esc(JSON.stringify(summary,null,2))}</pre><table><thead><tr><th>Result</th><th>OWASP</th><th>ID</th><th>Check</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
console.log("SECURITY_RUNTIME_SUMMARY", JSON.stringify(summary));
for (const f of findings) console.log(`${f.severity.toUpperCase()} [${f.owasp}/${f.id}] ${f.title} — ${f.detail}`);
if (findings.some((x) => ["critical", "high"].includes(x.severity))) process.exitCode = 2;
