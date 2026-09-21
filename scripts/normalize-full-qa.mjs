import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const productPath = path.join(root, "qa-artifacts-full-product", "product-full-qa.json");
const basicPath = path.join(root, "qa-artifacts", "qa-report.json");
const regressionPath = path.join(root, "qa-artifacts-full-product", "regressions", "qa-regressions.json");

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const readOptionalJson = async (file) => {
  try { return await readJson(file); } catch { return null; }
};
const countSeverity = (findings) => findings.reduce((acc, finding) => {
  const key = String(finding.severity || "unknown").toLowerCase();
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function isKnownContainerClipNoise(finding) {
  if (finding.title !== "Visible text is clipped/truncated without accessible fallback") return false;
  let samples = [];
  try { samples = JSON.parse(finding.evidence || "[]"); } catch { return false; }
  if (!Array.isArray(samples) || !samples.length) return false;

  // Only suppress structural containers that cannot themselves represent clipped copy.
  // Do not suppress content heroes such as continuity/connected/module-command; those have
  // previously exposed real mobile truncation and must remain product findings if detected.
  const knownStructuralClasses = new Set(["dashboard-hero", "ea-tabs"]);
  return samples.every((sample) => {
    const tag = String(sample?.tag || "").toUpperCase();
    const classes = String(sample?.cls || "").split(/\s+/).filter(Boolean);
    return ["ASIDE", "NAV", "MAIN"].includes(tag)
      || classes.some((name) => knownStructuralClasses.has(name));
  });
}

function isExampleRouteNoise(finding) {
  return finding.title === "GET route source exists but endpoint returned 404"
    && String(finding.detail || "").includes("/examples/");
}

function isSourceOnlyTinyFontInventory(finding) {
  return finding.area === "css-source"
    && finding.title === "Tiny font declarations below 11px";
}

function isCloudflareInsights(item) {
  return JSON.stringify(item).includes("static.cloudflareinsights.com");
}

function isGenericExternalLoadError(item) {
  const text = String(item?.text || item?.message || "");
  return /Failed to load resource/i.test(text) && /ERR_FAILED|blocked|CORS/i.test(text);
}

const product = await readJson(productPath);
const basic = await readJson(basicPath);
const regressions = await readOptionalJson(regressionPath);
const exactLanguagePass = Boolean(regressions?.checks?.some((check) =>
  check.name === "English language switch changes HTML and navigation" && check.status === "pass"));

const productNoise = product.findings.filter((finding) =>
  isKnownContainerClipNoise(finding)
  || isExampleRouteNoise(finding)
  || isSourceOnlyTinyFontInventory(finding));
product.findings = product.findings.filter((finding) =>
  !isKnownContainerClipNoise(finding)
  && !isExampleRouteNoise(finding)
  && !isSourceOnlyTinyFontInventory(finding));
product.summary = {
  ...product.summary,
  findings: product.findings.length,
  findingsBySeverity: countSeverity(product.findings),
  normalizedNoiseRemoved: productNoise.length,
  cssTinyFontDeclarationsAdvisory: product.source?.cssFindings?.length || 0,
};
product.normalization = {
  removed: productNoise,
  note: "Removed only confirmed harness/advisory noise: structural scroll geometry, example-only API routes, and source-only tiny-font inventory. Runtime rendered tiny text and content-hero clipping remain defects.",
};

const rawFailedRequests = basic.failedRequests || [];
const hadOnlyExternalBeaconFailures = rawFailedRequests.length > 0
  && rawFailedRequests.every((item) => isCloudflareInsights(item));
basic.failedRequests = rawFailedRequests.filter((item) => !isCloudflareInsights(item));
basic.consoleErrors = (basic.consoleErrors || []).filter((item) => {
  if (isCloudflareInsights(item)) return false;
  if (hadOnlyExternalBeaconFailures && isGenericExternalLoadError(item)) return false;
  return true;
});
const basicRemoved = [];
basic.findings = (basic.findings || []).filter((finding) => {
  if (finding.title === "Console errors detected" && basic.consoleErrors.length === 0) {
    basicRemoved.push(finding);
    return false;
  }
  if (finding.title === "Failed network requests detected" && basic.failedRequests.length === 0) {
    basicRemoved.push(finding);
    return false;
  }
  if (exactLanguagePass && finding.area === "i18n" && finding.title === "English language switch could not be verified automatically") {
    basicRemoved.push(finding);
    return false;
  }
  return true;
});
basic.summary = {
  ...basic.summary,
  consoleErrors: basic.consoleErrors.length,
  failedRequests: basic.failedRequests.length,
  findingsBySeverity: countSeverity(basic.findings),
  normalizedNoiseRemoved: basicRemoved.length,
  exactLanguageRegressionPass: exactLanguagePass,
};
basic.normalization = {
  removed: basicRemoved,
  note: "External Cloudflare Insights beacon failures caused by the Access-enabled QA browser, including their generic browser ERR_FAILED console companion, are excluded only when no first-party failed request exists. The legacy broad-selector i18n finding is excluded only when the separate exact .language-switch EN regression proves html[lang=en], translated Dashboard navigation, and the active EN control. First-party failures remain untouched.",
};

const productOut = path.join(root, "qa-artifacts-full-product", "product-full-qa-normalized.json");
const basicOut = path.join(root, "qa-artifacts", "qa-report-normalized.json");
await fs.writeFile(productOut, JSON.stringify(product, null, 2));
await fs.writeFile(basicOut, JSON.stringify(basic, null, 2));

const combined = {
  generatedAt: new Date().toISOString(),
  product: product.summary,
  basic: basic.summary,
  regressions: regressions ? {
    checks: regressions.checks?.length || 0,
    failures: regressions.failures?.length || 0,
    exactLanguagePass,
  } : null,
  remainingProductFindings: product.findings,
  remainingBasicFindings: basic.findings,
};
await fs.writeFile(path.join(root, "qa-artifacts-full-product", "normalized-summary.json"), JSON.stringify(combined, null, 2));

const rows = [
  ...product.findings.map((finding) => ({ suite: "Deep product", ...finding })),
  ...basic.findings.map((finding) => ({ suite: "WCAG/runtime", ...finding })),
];
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Fornost Normalized Full QA</title><style>body{font-family:system-ui,sans-serif;margin:32px;color:#172021}h1{margin-bottom:6px}.cards{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.card{padding:14px 18px;border:1px solid #d8dfdf;border-radius:10px;min-width:170px}.card b{display:block;font-size:24px}table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #d8dfdf;text-align:left;vertical-align:top}th{background:#f6f8f8}.medium{color:#8f4f12}.high,.critical{color:#b4303c}.low{color:#286f9f}</style></head><body><h1>Fornost Normalized Full QA</h1><p>Known harness-only false positives and source-only advisories are separated from runtime product defects; no first-party runtime error is suppressed.</p><div class="cards"><div class="card">Deep product findings<b>${product.findings.length}</b></div><div class="card">WCAG/runtime findings<b>${basic.findings.length}</b></div><div class="card">Noise/advisories removed<b>${productNoise.length + basicRemoved.length}</b></div><div class="card">First-party 5xx<b>${product.summary.firstParty5xx ?? 0}</b></div></div><table><thead><tr><th>Suite</th><th>Severity</th><th>Area</th><th>Finding</th><th>Detail</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.suite)}</td><td class="${escapeHtml(row.severity)}">${escapeHtml(row.severity)}</td><td>${escapeHtml(row.area)}</td><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.detail)}</td></tr>`).join("")}</tbody></table></body></html>`;
await fs.writeFile(path.join(root, "qa-artifacts-full-product", "normalized-full-qa.html"), html);

console.log(JSON.stringify({ product: product.summary, basic: basic.summary, exactLanguagePass }, null, 2));
