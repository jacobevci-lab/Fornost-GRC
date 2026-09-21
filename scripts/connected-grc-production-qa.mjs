import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = (process.env.FORNOST_PROD_URL || "https://app.fornostsecurity.com").replace(/\/$/, "");
const baseOrigin = new URL(baseUrl).origin;
const accessClientId = process.env.CF_ACCESS_CLIENT_ID || "";
const accessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";
const smokeEmail = process.env.FORNOST_SMOKE_EMAIL || "";
const smokePassword = process.env.FORNOST_SMOKE_PASSWORD || "";
const outDir = path.resolve("qa-artifacts");

const sourceDefinitions = [
  { key: "findings", path: "/api/findings", module: "Bulgular ve CAPA" },
  { key: "incidents", path: "/api/incidents", module: "Güvenlik Olayları" },
  { key: "continuity", path: "/api/continuity", module: "İş Sürekliliği" },
  { key: "policy", path: "/api/policy-lifecycle", module: "Politika Merkezi" },
  { key: "riskAppetite", path: "/api/risk-appetite", module: "Risk İştahı ve KRI" },
  { key: "regulatory", path: "/api/regulatory-intelligence", module: "Regülasyon Merkezi" },
  { key: "thirdParty", path: "/api/third-party-risk", module: "Tedarikçiler" },
];

const accessHeaders = {};
if (accessClientId && accessClientSecret) {
  accessHeaders["CF-Access-Client-Id"] = accessClientId;
  accessHeaders["CF-Access-Client-Secret"] = accessClientSecret;
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  endpointChecks: [],
  ui: {},
  language: {},
  consoleErrors: [],
  pageErrors: [],
  firstPartyFailedRequests: [],
  failures: [],
};

function fail(name, detail) {
  report.failures.push({ name, detail });
}

function topLevelArrayCount(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return Object.values(value).reduce((sum, item) => sum + (Array.isArray(item) ? item.length : 0), 0);
}

function isCloudflareInsights(urlOrText) {
  return /static\.cloudflareinsights\.com|beacon\.min\.js/i.test(String(urlOrText || ""));
}

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, colorScheme: "light" });

try {
  const login = await context.request.post(`${baseUrl}/api/auth`, {
    headers: { ...accessHeaders, origin: baseUrl, "content-type": "application/json" },
    data: { action: "login", email: smokeEmail, password: smokePassword },
  });
  if (login.status() !== 200) {
    fail("Dedicated smoke login", `HTTP ${login.status()}: ${(await login.text()).slice(0, 300)}`);
    throw new Error("Connected GRC production QA cannot continue without an authenticated session.");
  }

  for (const source of sourceDefinitions) {
    const response = await context.request.get(`${baseUrl}${source.path}`, {
      headers: { ...accessHeaders, accept: "application/json" },
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    const arrayRecords = topLevelArrayCount(payload);
    report.endpointChecks.push({
      key: source.key,
      path: source.path,
      module: source.module,
      status: response.status(),
      ok: response.ok(),
      topLevelArrayRecords: arrayRecords,
    });
    if (!response.ok()) fail(`Live source ${source.key}`, `${source.path} returned HTTP ${response.status()}`);
  }

  const page = await context.newPage();
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== baseOrigin || !accessClientId || !accessClientSecret) {
      await route.continue();
      return;
    }
    await route.continue({ headers: { ...request.headers(), ...accessHeaders } });
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const locationUrl = message.location()?.url || "";
    const text = message.text();
    if (isCloudflareInsights(locationUrl) || isCloudflareInsights(text)) return;
    report.consoleErrors.push({ text, sourceUrl: locationUrl, pageUrl: page.url() });
  });
  page.on("pageerror", (error) => report.pageErrors.push({ message: error.message, pageUrl: page.url() }));
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (isCloudflareInsights(url)) return;
    if (new URL(url).origin !== baseOrigin) return;
    report.firstPartyFailedRequests.push({
      url,
      method: request.method(),
      failure: request.failure()?.errorText || "unknown",
    });
  });

  const navigation = await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (!navigation || navigation.status() >= 400) fail("Application navigation", `HTTP ${navigation?.status() ?? "no response"}`);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

  const connectedButton = page.locator('nav button[aria-label="Bağlantılı GRC Haritası"]').first();
  if (!(await connectedButton.count())) {
    fail("Connected GRC navigation", "Bağlantılı GRC Haritası navigation button was not found.");
  } else {
    await connectedButton.evaluate((element) => element.click());
    await page.locator(".connected-grc").waitFor({ state: "visible", timeout: 10_000 });

    const liveStatus = page.locator(".connected-hero small").first();
    try {
      await liveStatus.waitFor({ state: "visible", timeout: 5_000 });
      await page.waitForFunction(() => {
        const text = document.querySelector(".connected-hero small")?.textContent || "";
        return /7\/7/.test(text) && !/YÜKLENİYOR|LOADING LIVE SOURCES/i.test(text);
      }, undefined, { timeout: 20_000 });
    } catch {
      fail("Connected GRC live-source readiness", `Expected 7/7 live sources, observed: ${(await liveStatus.textContent().catch(() => "")) || "missing status"}`);
    }

    const sourceStatusText = (await liveStatus.textContent().catch(() => ""))?.trim() || "";
    const relationshipRows = await page.locator(".connected-table article").count();
    const unresolvedRows = await page.locator(".connected-unresolved div").count();
    const domainButtons = await page.locator(".connected-layout aside button").allTextContents();
    const kpiValues = await page.locator(".connected-kpis article b").allTextContents();
    const loadingVisible = /YÜKLENİYOR|LOADING LIVE SOURCES/i.test(sourceStatusText);

    report.ui = {
      sourceStatusText,
      liveSourcesReady: /7\/7/.test(sourceStatusText) && !loadingVisible,
      relationshipRows,
      unresolvedRows,
      domainButtons: domainButtons.map((value) => value.replace(/\s+/g, " ").trim()),
      kpiValues: kpiValues.map((value) => value.trim()),
    };

    if (!report.ui.liveSourcesReady) fail("Connected GRC UI source status", sourceStatusText || "status text missing");
    if (relationshipRows < 1) fail("Connected GRC relationship register", "No relationship rows rendered after live sources completed.");

    for (const endpoint of report.endpointChecks.filter((item) => item.ok && item.topLevelArrayRecords > 0)) {
      const represented = domainButtons.some((text) => text.includes(endpoint.module));
      if (!represented) fail("Connected GRC domain projection", `${endpoint.module} returned ${endpoint.topLevelArrayRecords} top-level records but is absent from domain density.`);
    }

    await page.screenshot({ path: path.join(outDir, "connected-grc-live-sources.png"), fullPage: true, animations: "disabled" });
  }

  const langCandidates = [
    page.getByRole("button", { name: /English|EN|İngilizce/i }),
    page.locator('button[title*="English" i], button[aria-label*="English" i], button:has-text("EN")'),
  ];
  let languageSwitched = false;
  for (const candidate of langCandidates) {
    if (!(await candidate.count())) continue;
    try {
      await candidate.first().click();
      await page.waitForFunction(() => document.documentElement.lang === "en", undefined, { timeout: 5_000 });
      await page.locator('nav button[aria-label="Dashboard"]').first().waitFor({ state: "attached", timeout: 5_000 });
      languageSwitched = true;
      break;
    } catch {}
  }
  report.language = {
    exactEnglishPass: languageSwitched,
    htmlLang: await page.locator("html").getAttribute("lang"),
    dashboardNavPresent: Boolean(await page.locator('nav button[aria-label="Dashboard"]').count()),
  };
  if (!languageSwitched) fail("English language switch", `html lang=${report.language.htmlLang}; Dashboard nav=${report.language.dashboardNavPresent}`);

  if (report.consoleErrors.length) fail("First-party/runtime console errors", JSON.stringify(report.consoleErrors.slice(0, 5)));
  if (report.pageErrors.length) fail("Page errors", JSON.stringify(report.pageErrors.slice(0, 5)));
  if (report.firstPartyFailedRequests.length) fail("First-party failed requests", JSON.stringify(report.firstPartyFailedRequests.slice(0, 10)));
} finally {
  await browser.close();
}

report.ok = report.failures.length === 0;
await fs.writeFile(path.join(outDir, "connected-grc-live-source-report.json"), JSON.stringify(report, null, 2));
console.log(`CONNECTED_GRC_QA_SUMMARY ${JSON.stringify({
  ok: report.ok,
  liveSources: `${report.endpointChecks.filter((item) => item.ok).length}/${sourceDefinitions.length}`,
  sourceStatusText: report.ui.sourceStatusText || "",
  relationshipRows: report.ui.relationshipRows ?? 0,
  exactEnglishPass: report.language.exactEnglishPass || false,
  consoleErrors: report.consoleErrors.length,
  pageErrors: report.pageErrors.length,
  firstPartyFailedRequests: report.firstPartyFailedRequests.length,
  failures: report.failures.length,
})}`);
if (!report.ok) {
  console.error(`CONNECTED_GRC_QA_FAILURES ${JSON.stringify(report.failures)}`);
  process.exitCode = 1;
}
