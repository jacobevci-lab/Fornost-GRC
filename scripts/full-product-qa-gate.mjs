import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = (process.env.FORNOST_PROD_URL || "https://app.fornostsecurity.com").replace(/\/$/, "");
const accessClientId = process.env.CF_ACCESS_CLIENT_ID || "";
const accessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";
const smokeEmail = process.env.FORNOST_SMOKE_EMAIL || "";
const smokePassword = process.env.FORNOST_SMOKE_PASSWORD || "";
const reportPath = path.resolve("qa-artifacts-v2/qa-report-v2.json");
const gatePath = path.resolve("qa-artifacts-v2/qa-gate.json");

// Keep the comprehensive v2 scanner intact. Its raw artifact remains immutable evidence;
// this wrapper applies an explicit production gate after targeted runtime verification.
process.env.QA_FAIL_ON_HIGH = "0";
await import("./full-product-qa-v2.mjs");

const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const origin = new URL(baseUrl).origin;
const accessHeaders = accessClientId && accessClientSecret
  ? { "CF-Access-Client-Id": accessClientId, "CF-Access-Client-Secret": accessClientSecret }
  : {};

function isSharedBrandNoise(finding) {
  return finding?.title === "Opposite-language module labels remain visible"
    && String(finding?.detail || "").trim() === "Ask Fornost";
}
function isBenignAbortedGet(item) {
  if (!item?.url || !item?.error) return false;
  let sameOrigin = false;
  try { sameOrigin = new URL(item.url).origin === origin; } catch {}
  return sameOrigin
    && ["GET", "HEAD"].includes(String(item.method || "GET").toUpperCase())
    && /ERR_ABORTED/i.test(String(item.error));
}
function isCloudflareAnalyticsFailure(item) {
  return /^https:\/\/static\.cloudflareinsights\.com\//i.test(String(item?.url || ""))
    && /ERR_FAILED|blocked|cors/i.test(String(item?.error || ""));
}

async function configureContext(context) {
  if (!Object.keys(accessHeaders).length) return;
  await context.route(`${origin}/**`, async (route) => {
    const request = route.request();
    await route.continue({ headers: { ...request.headers(), ...accessHeaders } });
  });
}
async function login(context) {
  const response = await context.request.post(`${baseUrl}/api/auth`, {
    headers: { ...accessHeaders, origin, "content-type": "application/json" },
    data: { action: "login", email: smokeEmail, password: smokePassword },
  });
  if (response.status() !== 200) throw new Error(`Smoke login failed: HTTP ${response.status()}`);
}

async function verifySidebarTooltip(browser) {
  const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, colorScheme: "light" });
  try {
    await configureContext(context);
    await login(context);
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(700);

    const tr = page.getByRole("button", { name: "TR", exact: true });
    if (await tr.count()) await tr.first().click();

    const iconMode = page.locator(".sidebar-view-controls button").filter({ hasText: /^(İkon|Icons)$/ }).first();
    if (await iconMode.count()) {
      await iconMode.click();
    } else {
      const legacyCompact = page.getByRole("button", { name: /Menüyü daralt|Compact navigation/i }).first();
      if (!(await legacyCompact.count())) throw new Error("Compact navigation control not found");
      await legacyCompact.click();
    }
    await page.waitForTimeout(250);

    const shellCompact = await page.locator(".shell.sidebar-compact").count();
    if (!shellCompact) throw new Error("Sidebar did not enter compact mode");

    const button = page.locator("#fornost-navigation button[aria-label]:visible").first();
    if (!(await button.count())) throw new Error("No visible compact navigation icon found");
    const label = await button.getAttribute("aria-label");
    if (!label) throw new Error("Compact navigation icon has no aria-label");

    await button.hover();
    await page.waitForTimeout(180);
    const hoverTooltip = page.locator('[role="tooltip"]:visible').filter({ hasText: label });
    if (!(await hoverTooltip.count())) throw new Error(`Hover tooltip missing for ${label}`);

    await button.focus();
    await page.waitForTimeout(180);
    const focusTooltip = page.locator('[role="tooltip"]:visible').filter({ hasText: label });
    if (!(await focusTooltip.count())) throw new Error(`Keyboard-focus tooltip missing for ${label}`);
    const describedBy = await button.getAttribute("aria-describedby");
    if (!describedBy?.includes("fornost-sidebar-icon-tooltip")) throw new Error(`Tooltip is not associated with ${label}`);

    return { passed: true, label, hover: true, focus: true, ariaDescribedBy: describedBy };
  } finally {
    await context.close();
  }
}

async function verifyMobileLocale(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  try {
    await configureContext(context);
    await login(context);
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(700);

    const en = page.getByRole("button", { name: "EN", exact: true });
    if (!(await en.count()) || !(await en.first().isVisible())) throw new Error("Mobile EN language control is not visible");
    await en.first().click();
    await page.waitForTimeout(350);

    const lang = (await page.locator("html").getAttribute("lang")) || "";
    const heading = (await page.locator("h1").first().textContent())?.trim() || "";
    if (!lang.toLowerCase().startsWith("en")) throw new Error(`Mobile locale remained ${lang || "unset"}`);
    if (heading !== "Dashboard") throw new Error(`Mobile English heading mismatch: ${heading || "empty"}`);
    return { passed: true, lang, heading };
  } finally {
    await context.close();
  }
}

if (!accessClientId || !accessClientSecret || !smokeEmail || !smokePassword) {
  throw new Error("Production QA gate requires Cloudflare Access and smoke-account credentials.");
}

const browser = await chromium.launch({ headless: true });
let sidebarVerification = { passed: false, error: "not-run" };
let mobileLocaleVerification = { passed: false, error: "not-run" };
try {
  try { sidebarVerification = await verifySidebarTooltip(browser); }
  catch (error) { sidebarVerification = { passed: false, error: error instanceof Error ? error.message : String(error) }; }
  try { mobileLocaleVerification = await verifyMobileLocale(browser); }
  catch (error) { mobileLocaleVerification = { passed: false, error: error instanceof Error ? error.message : String(error) }; }
} finally {
  await browser.close();
}

const rawFailedRequests = Array.isArray(report.runtime?.failedRequests) ? report.runtime.failedRequests : [];
const hasCloudflareAnalyticsFailure = rawFailedRequests.some(isCloudflareAnalyticsFailure);
const effectiveFailedRequests = rawFailedRequests.filter((item) => !isBenignAbortedGet(item) && !isCloudflareAnalyticsFailure(item));
const rawConsoleErrors = Array.isArray(report.runtime?.consoleErrors) ? report.runtime.consoleErrors : [];
const effectiveConsoleErrors = rawConsoleErrors.filter((item) => {
  const text = String(item?.text || "");
  if (/static\.cloudflareinsights\.com/i.test(text) && /cors|blocked|access-control/i.test(text)) return false;
  if (hasCloudflareAnalyticsFailure && /^Failed to load resource: net::ERR_FAILED\s*$/i.test(text)) return false;
  return true;
});

const excluded = [];
const effectiveFindings = [];
for (const item of report.findings || []) {
  let reason = "";
  if (isSharedBrandNoise(item)) reason = "shared-brand-label";
  else if (sidebarVerification.passed && item?.area === "sidebar" && item?.title === "Collapse control not found") reason = "superseded-by-runtime-sidebar-contract";
  else if (!effectiveConsoleErrors.length && item?.area === "runtime" && item?.title === "Browser console errors detected") reason = "cloudflare-analytics-harness-noise";
  else if (!effectiveFailedRequests.length && item?.area === "network" && item?.title === "Failed browser requests detected") reason = "expected-third-party-or-navigation-abort";
  if (reason) excluded.push({ ...item, reason });
  else effectiveFindings.push(item);
}

if (!sidebarVerification.passed) {
  effectiveFindings.push({ severity: "high", area: "sidebar", title: "Compact navigation tooltip runtime contract failed", detail: sidebarVerification.error || "unknown" });
}
if (!mobileLocaleVerification.passed) {
  effectiveFindings.push({ severity: "high", area: "responsive:mobile", title: "Mobile language selector runtime contract failed", detail: mobileLocaleVerification.error || "unknown" });
}

effectiveFindings.sort((a, b) => ({ critical: 5, high: 4, medium: 3, low: 2, info: 1 }[b.severity] || 0) - ({ critical: 5, high: 4, medium: 3, low: 2, info: 1 }[a.severity] || 0));
const gate = {
  version: "1.0",
  sourceReport: path.relative(process.cwd(), reportPath),
  generatedAt: new Date().toISOString(),
  sidebarVerification,
  mobileLocaleVerification,
  runtimeNormalization: {
    rawConsoleErrors: rawConsoleErrors.length,
    effectiveConsoleErrors,
    rawFailedRequests: rawFailedRequests.length,
    effectiveFailedRequests,
  },
  excluded,
  effectiveFindings,
  summary: {
    critical: effectiveFindings.filter((x) => x.severity === "critical").length,
    high: effectiveFindings.filter((x) => x.severity === "high").length,
    medium: effectiveFindings.filter((x) => x.severity === "medium").length,
    low: effectiveFindings.filter((x) => x.severity === "low").length,
    excludedHarnessNoise: excluded.length,
  },
};
await fs.writeFile(gatePath, JSON.stringify(gate, null, 2));

console.log("FULL_QA_PRODUCTION_GATE", JSON.stringify(gate.summary));
console.log("SIDEBAR_TOOLTIP_CONTRACT", JSON.stringify(sidebarVerification));
console.log("MOBILE_LOCALE_CONTRACT", JSON.stringify(mobileLocaleVerification));
for (const item of effectiveFindings.slice(0, 80)) {
  console.log(`${String(item.severity).toUpperCase()} [${item.area}] ${item.title}${item.detail ? ` — ${item.detail}` : ""}`);
}

const blocking = effectiveFindings.some((item) => item.severity === "critical" || item.severity === "high");
process.exitCode = blocking ? 2 : 0;
