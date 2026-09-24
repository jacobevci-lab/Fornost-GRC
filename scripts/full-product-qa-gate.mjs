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
// this wrapper applies explicit production contracts after targeted runtime verification.
process.env.QA_FAIL_ON_HIGH = "0";
await import("./full-product-qa-v2.mjs");

const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const origin = new URL(baseUrl).origin;
const accessHeaders = accessClientId && accessClientSecret
  ? { "CF-Access-Client-Id": accessClientId, "CF-Access-Client-Secret": accessClientSecret }
  : {};

const responsiveViewports = [
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
  { name: "mobile-small", width: 360, height: 740 },
];

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
function verificationKey(viewport, locale) {
  return `${viewport}:${locale}`;
}
function isLocaleSwitchFinding(item) {
  return /^Locale switch failed(?::\s*(?:tr|en))?$/i.test(String(item?.title || "").trim());
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
async function firstVisible(locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = locator.nth(i);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}
async function visibleLanguageControl(page, label) {
  await page.locator(".language-switch").first().waitFor({ state: "attached", timeout: 5_000 }).catch(() => {});
  const buttons = page.locator(".language-switch button");
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = buttons.nth(i);
    const text = ((await candidate.textContent().catch(() => "")) || "").trim();
    if (text === label && await candidate.isVisible().catch(() => false)) return candidate;
  }
  return firstVisible(page.getByRole("button", { name: label, exact: true }));
}
async function waitForApp(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("body").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(700);
}
async function switchLocale(page, locale) {
  const expectedLang = locale === "en" ? "en" : "tr";
  const current = ((await page.locator("html").getAttribute("lang")) || "").toLowerCase();
  if (current.startsWith(expectedLang)) return { changed: false, control: "already-selected" };

  const targetLabel = locale === "en" ? "EN" : "TR";
  const control = await visibleLanguageControl(page, targetLabel);
  if (!control) throw new Error(`${targetLabel} language control is not visible`);
  await control.click();
  await page.waitForFunction(
    (lang) => document.documentElement.lang.toLowerCase().startsWith(lang),
    expectedLang,
    { timeout: 5_000 },
  );
  return { changed: true, control: targetLabel };
}

async function verifySidebarContract(browser) {
  const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, colorScheme: "light" });
  try {
    await configureContext(context);
    await login(context);
    const page = await context.newPage();
    await waitForApp(page);
    await switchLocale(page, "tr");

    const shell = page.locator(".shell").first();
    const sidebar = page.locator('aside[aria-label="Ana menü"], aside[aria-label="Main navigation"]').first();
    if (!(await shell.count()) || !(await sidebar.count())) throw new Error("Application sidebar shell was not found");

    const expandedControl = await firstVisible(page.locator('.sidebar-view-controls button[aria-label="Geniş menü"], .sidebar-view-controls button[aria-label="Expanded navigation"]'));
    const compactControl = await firstVisible(page.locator('.sidebar-view-controls button[aria-label="İkon menüsü"], .sidebar-view-controls button[aria-label="Icon navigation"]'));
    const hiddenControl = await firstVisible(page.locator('.sidebar-view-controls button[aria-label="Menüyü gizle"], .sidebar-view-controls button[aria-label="Hide navigation"]'));
    if (!compactControl) throw new Error("Icons navigation control is not visible");
    if (!hiddenControl) throw new Error("Hide navigation control is not visible");

    if (expandedControl) {
      await expandedControl.click();
      await page.waitForTimeout(180);
    }
    const expandedWidth = Math.round((await sidebar.boundingBox())?.width || 0);

    await compactControl.click();
    await page.waitForTimeout(220);
    if (!(await shell.evaluate((node) => node.classList.contains("sidebar-compact")))) {
      throw new Error("Sidebar did not enter Icons/compact mode");
    }
    const compactWidth = Math.round((await sidebar.boundingBox())?.width || 0);
    if (expandedWidth > 0 && compactWidth > 0 && compactWidth >= expandedWidth) {
      throw new Error(`Compact sidebar width did not shrink (${expandedWidth}px -> ${compactWidth}px)`);
    }

    const navButton = await firstVisible(page.locator("#fornost-navigation button[aria-label]"));
    if (!navButton) throw new Error("No visible navigation icon was found in Icons mode");
    const label = (await navButton.getAttribute("aria-label"))?.trim() || "";
    const title = (await navButton.getAttribute("title"))?.trim() || "";
    if (!label) throw new Error("Compact navigation icon has no accessible name");
    if (title !== label) throw new Error(`Compact navigation title mismatch for ${label}`);
    await navButton.focus();
    if (!(await navButton.evaluate((node) => document.activeElement === node))) {
      throw new Error(`Compact navigation icon is not keyboard focusable: ${label}`);
    }

    await hiddenControl.click();
    await page.waitForTimeout(220);
    if (!(await shell.evaluate((node) => node.classList.contains("sidebar-hidden")))) {
      throw new Error("Sidebar did not enter Hide mode");
    }

    const restore = await firstVisible(page.getByRole("button", { name: /Ana menüyü aç|Open main navigation|Menüyü göster|Show navigation/i }));
    if (!restore) throw new Error("Hidden sidebar cannot be restored");
    await restore.click();
    await page.waitForTimeout(220);
    if (await shell.evaluate((node) => node.classList.contains("sidebar-hidden"))) {
      throw new Error("Sidebar remained hidden after restore");
    }

    return {
      passed: true,
      modes: ["expanded", "compact", "hidden", "restored"],
      expandedWidth,
      compactWidth,
      sampleNavigationLabel: label,
      sampleNavigationTitle: title,
      keyboardFocusable: true,
    };
  } finally {
    await context.close();
  }
}

async function verifyResponsiveLocale(browser, viewport, locale) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: "light",
  });
  try {
    await configureContext(context);
    await login(context);
    const page = await context.newPage();
    await waitForApp(page);
    const transition = await switchLocale(page, locale);
    await page.waitForTimeout(250);

    const expectedLang = locale === "en" ? "en" : "tr";
    const expectedHeading = locale === "en" ? "Dashboard" : "Gösterge Paneli";
    const expectedNav = expectedHeading;
    const lang = ((await page.locator("html").getAttribute("lang")) || "").toLowerCase();
    const heading = ((await page.locator("h1").first().textContent()) || "").trim();
    const navMatch = await page.locator(`#fornost-navigation button[aria-label=${JSON.stringify(expectedNav)}]`).count();
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));

    if (!lang.startsWith(expectedLang)) throw new Error(`HTML lang mismatch: expected=${expectedLang}, actual=${lang || "unset"}`);
    if (heading !== expectedHeading) throw new Error(`Heading mismatch: expected=${expectedHeading}, actual=${heading || "empty"}`);
    if (!navMatch) throw new Error(`Localized navigation label missing: ${expectedNav}`);
    if (overflow > 4) throw new Error(`Responsive page overflows viewport by ${overflow}px`);

    return {
      passed: true,
      viewport: viewport.name,
      width: viewport.width,
      height: viewport.height,
      locale,
      lang,
      heading,
      transition,
      overflow,
    };
  } finally {
    await context.close();
  }
}

if (!accessClientId || !accessClientSecret || !smokeEmail || !smokePassword) {
  throw new Error("Production QA gate requires Cloudflare Access and smoke-account credentials.");
}

const browser = await chromium.launch({ headless: true });
let sidebarVerification = { passed: false, error: "not-run" };
const responsiveLocaleVerifications = {};
try {
  try { sidebarVerification = await verifySidebarContract(browser); }
  catch (error) { sidebarVerification = { passed: false, error: error instanceof Error ? error.message : String(error) }; }

  for (const viewport of responsiveViewports) {
    for (const locale of ["tr", "en"]) {
      const key = verificationKey(viewport.name, locale);
      try { responsiveLocaleVerifications[key] = await verifyResponsiveLocale(browser, viewport, locale); }
      catch (error) {
        responsiveLocaleVerifications[key] = {
          passed: false,
          viewport: viewport.name,
          locale,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }
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

function targetedResponsivePasses(item) {
  const area = String(item?.area || "");
  const areaMatch = area.match(/^responsive:(tablet|mobile|mobile-small)(?::(tr|en)(?::i18n)?)?$/);
  if (!areaMatch) return false;
  const viewport = areaMatch[1];
  let locale = areaMatch[2] || "";
  if (!locale && isLocaleSwitchFinding(item)) {
    const combined = `${String(item?.title || "")} ${String(item?.detail || "")}`.trim();
    const localeMatch = combined.match(/(?:^|[:\s])(tr|en)\s*$/i);
    locale = localeMatch?.[1]?.toLowerCase() || "";
  }
  if (!locale) return false;
  return responsiveLocaleVerifications[verificationKey(viewport, locale)]?.passed === true;
}

const excluded = [];
const effectiveFindings = [];
for (const item of report.findings || []) {
  let reason = "";
  if (isSharedBrandNoise(item)) reason = "shared-brand-label";
  else if (sidebarVerification.passed && item?.area === "sidebar" && item?.title === "Collapse control not found") reason = "superseded-by-current-sidebar-view-contract";
  else if (targetedResponsivePasses(item) && isLocaleSwitchFinding(item)) reason = "superseded-by-visible-responsive-locale-contract";
  else if (targetedResponsivePasses(item) && item?.title === "HTML lang does not match selected locale") reason = "superseded-by-responsive-html-lang-contract";
  else if (!effectiveConsoleErrors.length && item?.area === "runtime" && item?.title === "Browser console errors detected") reason = "cloudflare-analytics-harness-noise";
  else if (!effectiveFailedRequests.length && item?.area === "network" && item?.title === "Failed browser requests detected") reason = "expected-third-party-or-navigation-abort";
  if (reason) excluded.push({ ...item, reason });
  else effectiveFindings.push(item);
}

if (!sidebarVerification.passed) {
  effectiveFindings.push({
    severity: "high",
    area: "sidebar",
    title: "Sidebar Full / Icons / Hide runtime contract failed",
    detail: sidebarVerification.error || "unknown",
  });
}
for (const [key, verification] of Object.entries(responsiveLocaleVerifications)) {
  if (verification.passed) continue;
  effectiveFindings.push({
    severity: "high",
    area: `responsive:${verification.viewport || key}`,
    title: `Responsive ${String(verification.locale || "").toUpperCase()} locale runtime contract failed`,
    detail: verification.error || "unknown",
  });
}

effectiveFindings.sort((a, b) => ({ critical: 5, high: 4, medium: 3, low: 2, info: 1 }[b.severity] || 0) - ({ critical: 5, high: 4, medium: 3, low: 2, info: 1 }[a.severity] || 0));
const gate = {
  version: "1.1",
  sourceReport: path.relative(process.cwd(), reportPath),
  generatedAt: new Date().toISOString(),
  sidebarVerification,
  responsiveLocaleVerifications,
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
    responsiveContractsPassed: Object.values(responsiveLocaleVerifications).filter((x) => x.passed).length,
    responsiveContractsTotal: Object.keys(responsiveLocaleVerifications).length,
  },
};
await fs.writeFile(gatePath, JSON.stringify(gate, null, 2));

console.log("FULL_QA_PRODUCTION_GATE", JSON.stringify(gate.summary));
console.log("SIDEBAR_VIEW_CONTRACT", JSON.stringify(sidebarVerification));
console.log("RESPONSIVE_LOCALE_CONTRACTS", JSON.stringify(responsiveLocaleVerifications));
for (const item of effectiveFindings.slice(0, 80)) {
  console.log(`${String(item.severity).toUpperCase()} [${item.area}] ${item.title}${item.detail ? ` — ${item.detail}` : ""}`);
}

const blocking = effectiveFindings.some((item) => item.severity === "critical" || item.severity === "high");
process.exitCode = blocking ? 2 : 0;
