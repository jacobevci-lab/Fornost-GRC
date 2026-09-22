import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "security-artifacts", "static-policy");
await fs.mkdir(outDir, { recursive: true });

const findings = [];
const checks = [];
const weight = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
function add(id, owasp, title, passed, severity, detail, evidence = "") {
  const item = { id, owasp, title, passed, severity, detail, evidence };
  checks.push(item);
  if (!passed) findings.push(item);
}
async function text(file) {
  return fs.readFile(path.join(root, file), "utf8");
}
async function walk(dir, collected = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", ".next", ".wrangler", "build", "security-artifacts", "qa-artifacts", "qa-artifacts-v2"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, collected);
    else if (/\.(ts|tsx|js|mjs|cjs|json|ya?ml|toml|sh|Dockerfile)$/i.test(entry.name) || entry.name === "Dockerfile") collected.push(full);
  }
  return collected;
}

const authSecurity = await text("app/api/auth/security.ts");
const authRoute = await text("app/api/auth/route.ts");
const packageJson = JSON.parse(await text("package.json"));
const dockerfile = await text("Dockerfile");

const iterationMatch = authSecurity.match(/PBKDF2_ITERATIONS\s*=\s*([\d_]+)/);
const iterations = iterationMatch ? Number(iterationMatch[1].replaceAll("_", "")) : 0;
add("CRYPTO-PBKDF2", "A02", "PBKDF2-HMAC-SHA256 work factor meets OWASP guidance", iterations >= 600_000, "high", `configured iterations=${iterations || "not found"}; policy floor=600000`, "app/api/auth/security.ts");
add("CRYPTO-SALT", "A02", "Password hashing uses random per-password salt", /getRandomValues\(new Uint8Array\(16\)\)/.test(authSecurity), "high", "Expected 16-byte random salt", "app/api/auth/security.ts");
add("SESSION-ENTROPY", "A07", "Session tokens use at least 32 random bytes", /getRandomValues\(new Uint8Array\((3[2-9]|[4-9]\d|\d{3,})\)\)/.test(authSecurity), "critical", "Expected >=32 random bytes", "app/api/auth/security.ts");
add("COOKIE-HTTPONLY", "A07", "Session cookie is HttpOnly", /httpOnly:\s*true/.test(authRoute), "high", "Cookie policy must set HttpOnly", "app/api/auth/route.ts");
add("COOKIE-SAMESITE", "A07", "Session cookie is SameSite Strict", /sameSite:\s*["']strict["']/.test(authRoute), "high", "Cookie policy must use SameSite=Strict", "app/api/auth/route.ts");
add("AUTH-LOCKOUT", "A07", "Local login has bounded failed-attempt lockout", /failed_attempts/.test(authRoute) && /attempts\s*>=\s*5/.test(authRoute) && /15\s*\*\s*60_000/.test(authRoute), "high", "Expected lockout after five failures for 15 minutes", "app/api/auth/route.ts");
add("AUTH-ORIGIN", "A01", "Authentication writes enforce same-origin", /if\s*\(!sameOrigin\(req\)\)/.test(authRoute), "critical", "Expected sameOrigin guard before auth mutations", "app/api/auth/route.ts");
add("AUTH-SIZE", "A04", "Authentication request body size is bounded", /content-length/.test(authRoute) && /16_384/.test(authRoute), "medium", "Expected explicit auth request size limit", "app/api/auth/route.ts");
add("TRUST-IDENTITY", "A01", "Platform identity trust is explicitly feature-gated", /FORNOST_TRUST_PLATFORM_IDENTITY/.test(authSecurity), "critical", "Expected explicit deployment flag before trusting forwarded identity", "app/api/auth/security.ts");

const allFiles = await walk(root);
const textFiles = [];
for (const file of allFiles) {
  try { textFiles.push({ file: path.relative(root, file), content: await fs.readFile(file, "utf8") }); } catch {}
}
const genericCodeFiles = textFiles.filter(({ file }) => file !== "scripts/security-static-policy-audit.mjs");
const evalHits = genericCodeFiles.filter(({ content }) => /\beval\s*\(|new\s+Function\s*\(/.test(content)).map(({ file }) => file);
add("CODE-EVAL", "A03", "No dynamic eval/new Function in application code", evalHits.length === 0, "high", evalHits.length ? evalHits.join(", ") : "none", evalHits.join(", "));
const weakHashHits = genericCodeFiles.filter(({ content }) => /(createHash\s*\(\s*["'](?:md5|sha1)["']|subtle\.digest\s*\(\s*["']SHA-1["'])/i.test(content)).map(({ file }) => file);
add("CRYPTO-WEAK-HASH", "A02", "No MD5/SHA-1 cryptographic hashing in application code", weakHashHits.length === 0, "high", weakHashHits.length ? weakHashHits.join(", ") : "none", weakHashHits.join(", "));
const htmlHits = genericCodeFiles.filter(({ content }) => /dangerouslySetInnerHTML/.test(content)).map(({ file }) => file);
add("XSS-DANGEROUS-HTML", "A03", "No React dangerouslySetInnerHTML sinks", htmlHits.length === 0, "medium", htmlHits.length ? htmlHits.join(", ") : "none", htmlHits.join(", "));
const sourceMapHits = textFiles.filter(({ file, content }) => /\.map\b/.test(file) && !file.endsWith("package-lock.json") && content.length > 0).map(({ file }) => file);
add("SOURCE-MAPS", "A05", "Repository does not contain generated JavaScript source maps", sourceMapHits.length === 0, "low", sourceMapHits.length ? sourceMapHits.slice(0, 20).join(", ") : "none");

const apiRouteFiles = textFiles.filter(({ file }) => /^app\/api\/.+\/route\.ts$/.test(file));
const writeRoutes = apiRouteFiles.filter(({ content }) => /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/.test(content));
const missingGuard = writeRoutes.filter(({ content }) => !/(requireRole\(|sameOrigin\()/.test(content)).map(({ file }) => file);
add("API-WRITE-GUARD", "A01", "Every API route with write methods contains role/origin enforcement", missingGuard.length === 0, "critical", missingGuard.length ? missingGuard.join(", ") : `${writeRoutes.length} write-route files checked`, missingGuard.join(", "));

const wildcardCors = apiRouteFiles.filter(({ content }) => /access-control-allow-origin["']?\s*[:,]\s*["']\*["']/i.test(content)).map(({ file }) => file);
add("CORS-WILDCARD", "A01", "Sensitive API routes do not set wildcard CORS", wildcardCors.length === 0, "high", wildcardCors.length ? wildcardCors.join(", ") : "none", wildcardCors.join(", "));

const envExamples = textFiles.filter(({ file }) => /(^|\/)\.env.*example$/i.test(file));
const secretLike = [];
for (const { file, content } of envExamples) {
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*#|^\s*$/.test(line)) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim();
    if (value && !/^<.*>$/.test(value) && !/^(false|true|0|1|localhost|https?:\/\/localhost)/i.test(value)) secretLike.push(`${file}:${key}`);
  }
}
add("SECRETS-EXAMPLE", "A02", "Example environment files do not embed credential-like values", secretLike.length === 0, "high", secretLike.length ? secretLike.join(", ") : "none");

const prodDeps = Object.keys(packageJson.dependencies || {});
add("DEPENDENCY-LOCK", "A06", "Repository includes package-lock.json for deterministic npm installs", await fs.access(path.join(root, "package-lock.json")).then(() => true).catch(() => false), "high", `${prodDeps.length} production dependencies declared`, "package-lock.json");
add("CONTAINER-NONROOT", "A05", "Runtime container drops root privileges", /\bUSER\s+\S+/i.test(dockerfile) && !/\bUSER\s+root\b/i.test(dockerfile.split(/\r?\n/).slice(-20).join("\n")), "high", "Dockerfile runtime stage should use non-root USER", "Dockerfile");

findings.sort((a, b) => (weight[b.severity] || 0) - (weight[a.severity] || 0));
const summary = { checks: checks.length, passed: checks.filter((x) => x.passed).length, failed: findings.length, bySeverity: findings.reduce((acc, x) => ({ ...acc, [x.severity]: (acc[x.severity] || 0) + 1 }), {}) };
const report = { version: "1.0", summary, checks, findings };
await fs.writeFile(path.join(outDir, "static-policy-audit.json"), JSON.stringify(report, null, 2));
console.log("STATIC_SECURITY_POLICY_SUMMARY", JSON.stringify(summary));
for (const f of findings) console.log(`${f.severity.toUpperCase()} [${f.owasp}/${f.id}] ${f.title} — ${f.detail}`);
if (findings.some((x) => ["critical", "high"].includes(x.severity))) process.exitCode = 2;
