import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = (process.env.FORNOST_PROD_URL || "https://app.fornostsecurity.com").replace(/\/$/, "");
const accessClientId = process.env.CF_ACCESS_CLIENT_ID || "";
const accessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";
const smokeEmail = process.env.FORNOST_SMOKE_EMAIL || "";
const smokePassword = process.env.FORNOST_SMOKE_PASSWORD || "";
const outDir = path.resolve("qa-artifacts");
const screenshotsDir = path.join(outDir, "screenshots");

const moduleLabels = [
  "Gösterge Paneli",
  "Benim İşlerim",
  "Risk Değerlendirmesi",
  "Risk İştahı ve KRI",
  "İş Etki Analizi (BIA)",
  "İş Sürekliliği ve Dayanıklılık",
  "Varlık Envanteri",
  "Uyum Yönetimi",
  "Politika Merkezi",
  "Tedarikçi Yönetimi",
  "Kontrol Kütüphanesi",
  "Kanıt Kütüphanesi",
  "Kanıt Otomasyonu",
  "Regülasyon Merkezi",
  "Güvenlik Olayları ve Kriz",
  "Bulgular ve CAPA",
  "Denetim Yönetimi",
  "Bağlantılı GRC Haritası",
  "Raporlama",
  "AI Yönetişimi",
  "Ask Fornost",
  "Sistem Ayarları",
  "AI Ayarları",
  "Ana Veri Yönetimi",
  "İş Akışı Entegrasyonları",
  "E-posta ve Bildirimler",
  "Kimlik ve Erişim",
];

const representativeModules = new Set([
  "Gösterge Paneli",
  "Risk Değerlendirmesi",
  "İş Etki Analizi (BIA)",
  "Varlık Envanteri",
  "Uyum Yönetimi",
  "Kontrol Kütüphanesi",
  "Kanıt Kütüphanesi",
  "Denetim Yönetimi",
  "Raporlama",
  "AI Yönetişimi",
  "Ask Fornost",
  "Sistem Ayarları",
  "Kimlik ve Erişim",
]);

const accessHeaders = {};
if (accessClientId && accessClientSecret) {
  accessHeaders["CF-Access-Client-Id"] = accessClientId;
  accessHeaders["CF-Access-Client-Secret"] = accessClientSecret;
}

const report = {
  startedAt: new Date().toISOString(),
  baseUrl,
  summary: {},
  environment: {},
  login: {},
  modules: [],
  responsive: [],
  darkTheme: [],
  accessibility: [],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  httpErrors: [],
  findings: [],
};

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(screenshotsDir, { recursive: true });

function slug(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "screen";
}

function addFinding(severity, area, title, detail = "", evidence = "") {
  report.findings.push({ severity, area, title, detail, evidence });
}

function uniquePush(array, item, keyFn = (x) => JSON.stringify(x)) {
  const key = keyFn(item);
  if (!array.some((existing) => keyFn(existing) === key)) array.push(item);
}

async function screenshot(page, name, fullPage = false) {
  const file = path.join(screenshotsDir, `${name}.png`);
  try {
    await page.screenshot({ path: file, fullPage, animations: "disabled" });
  } catch (error) {
    if (fullPage) {
      await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
      addFinding("info", "visual", "Full-page screenshot fallback", `${name}: ${error.message}`);
    } else {
      throw error;
    }
  }
  return path.relative(outDir, file);
}

function attachRuntimeObservers(page) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      uniquePush(report.consoleErrors, { text: msg.text(), url: page.url() }, (x) => `${x.text}|${x.url}`);
    }
  });
  page.on("pageerror", (error) => {
    uniquePush(report.pageErrors, { message: error.message, url: page.url() }, (x) => `${x.message}|${x.url}`);
  });
  page.on("requestfailed", (request) => {
    uniquePush(report.failedRequests, {
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || "unknown",
    }, (x) => `${x.method}|${x.url}|${x.failure}`);
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400) {
      uniquePush(report.httpErrors, { status, url: response.url() }, (x) => `${x.status}|${x.url}`);
    }
  });
}

async function loginViaApi(context) {
  const response = await context.request.post(`${baseUrl}/api/auth`, {
    headers: { ...accessHeaders, origin: baseUrl, "content-type": "application/json" },
    data: { action: "login", email: smokeEmail, password: smokePassword },
  });
  const body = await response.text();
  if (response.status() !== 200) throw new Error(`API login failed HTTP ${response.status()}: ${body.slice(0, 500)}`);
  return { status: response.status(), body };
}

async function domAudit(page, area) {
  const data = await page.evaluate(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll("button,a,input,select,textarea")].filter(visible);
    const emptyButtons = [...document.querySelectorAll("button")].filter(visible).filter((el) => {
      const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
      return !label;
    }).map((el) => el.outerHTML.slice(0, 300));
    const unlabeledInputs = [...document.querySelectorAll("input,select,textarea")].filter(visible).filter((el) => {
      const id = el.id;
      const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const wrapped = el.closest("label");
      return !explicit && !wrapped && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby");
    }).map((el) => ({ tag: el.tagName, type: el.getAttribute("type"), name: el.getAttribute("name"), placeholder: el.getAttribute("placeholder") }));
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const brokenImages = [...document.images].filter(visible).filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.currentSrc || img.src || img.alt);
    const smallTargets = controls.filter((el) => {
      if (el instanceof HTMLInputElement && ["hidden"].includes(el.type)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24);
    }).slice(0, 30).map((el) => ({
      tag: el.tagName,
      name: (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim().slice(0, 80),
      width: Math.round(el.getBoundingClientRect().width),
      height: Math.round(el.getBoundingClientRect().height),
    }));
    const horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 4;
    const overflowAmount = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
    const title = document.title;
    const lang = document.documentElement.lang;
    const h1 = [...document.querySelectorAll("h1")].find(visible)?.textContent?.trim() || "";
    const h2 = [...document.querySelectorAll("h2")].find(visible)?.textContent?.trim() || "";
    const activeNav = document.querySelector("nav button.active")?.getAttribute("aria-label") || "";
    return {
      title, lang, h1, h2, activeNav,
      horizontalOverflow, overflowAmount,
      emptyButtons, unlabeledInputs, duplicateIds, brokenImages, smallTargets,
      visibleControls: controls.length,
    };
  });

  if (data.horizontalOverflow) addFinding("high", area, "Horizontal page overflow", `${data.overflowAmount}px wider than viewport`);
  if (data.emptyButtons.length) addFinding("high", area, "Visible buttons without accessible names", JSON.stringify(data.emptyButtons.slice(0, 5)));
  if (data.unlabeledInputs.length) addFinding("medium", area, "Visible form controls without associated labels", JSON.stringify(data.unlabeledInputs.slice(0, 10)));
  if (data.duplicateIds.length) addFinding("high", area, "Duplicate DOM IDs", data.duplicateIds.join(", "));
  if (data.brokenImages.length) addFinding("high", area, "Broken visible images", data.brokenImages.join(", "));
  if (data.smallTargets.length) addFinding("low", area, "Small interaction targets (<24px)", JSON.stringify(data.smallTargets.slice(0, 10)));
  return data;
}

async function axeAudit(page, area) {
  try {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const violations = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.slice(0, 8).map((n) => ({ target: n.target, failureSummary: n.failureSummary })),
      nodeCount: v.nodes.length,
    }));
    report.accessibility.push({ area, violations });
    for (const violation of violations) {
      const severity = violation.impact === "critical" ? "critical" : violation.impact === "serious" ? "high" : violation.impact === "moderate" ? "medium" : "low";
      addFinding(severity, area, `Accessibility: ${violation.id}`, `${violation.help}; nodes=${violation.nodeCount}`, violation.helpUrl);
    }
    return violations;
  } catch (error) {
    addFinding("medium", area, "Accessibility scan failed", error.message);
    return [];
  }
}

async function checkLoginScreen(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    extraHTTPHeaders: accessHeaders,
    colorScheme: "light",
  });
  const page = await context.newPage();
  attachRuntimeObservers(page);
  const response = await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  report.login.status = response?.status() || 0;
  report.login.screenshot = await screenshot(page, "00-login-light", true);
  report.login.dom = await domAudit(page, "login");
  report.login.accessibility = await axeAudit(page, "login");
  const loginFields = await page.locator('input[name="email"], input[name="password"]').count();
  report.login.loginFields = loginFields;
  if (loginFields < 2) addFinding("high", "login", "Expected login fields not found", `Found ${loginFields} email/password fields`);
  await context.close();
}

async function auditDesktop(browser) {
  const context = await browser.newContext({
    viewport: { width: 1536, height: 960 },
    extraHTTPHeaders: accessHeaders,
    colorScheme: "light",
  });
  await loginViaApi(context);
  const page = await context.newPage();
  attachRuntimeObservers(page);
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);

  report.environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
    title: document.title,
    htmlLang: document.documentElement.lang,
  }));

  await screenshot(page, "01-dashboard-light", true);

  for (let i = 0; i < moduleLabels.length; i += 1) {
    const label = moduleLabels[i];
    const button = page.locator(`nav button[aria-label=${JSON.stringify(label)}]`).first();
    const count = await button.count();
    if (!count) {
      const item = { label, status: "missing" };
      report.modules.push(item);
      addFinding("high", "navigation", "Module navigation item missing", label);
      continue;
    }

    try {
      await button.evaluate((el) => el.click());
      await page.waitForTimeout(650);
      const dom = await domAudit(page, label);
      const file = await screenshot(page, `module-${String(i + 1).padStart(2, "0")}-${slug(label)}-light`);
      const violations = await axeAudit(page, label);
      const activeMatches = dom.activeNav === label;
      if (!activeMatches) addFinding("medium", label, "Active navigation state mismatch", `Expected ${label}; active=${dom.activeNav || "none"}`);
      report.modules.push({ label, status: "ok", screenshot: file, dom, violationCount: violations.length, activeMatches });
    } catch (error) {
      report.modules.push({ label, status: "error", error: error.message });
      addFinding("high", label, "Module failed to render/navigate", error.message);
    }
  }

  // Sidebar expanded -> compact -> hidden -> restored.
  for (const label of ["Menüyü daralt", "Menüyü gizle"]) {
    const control = page.getByRole("button", { name: label, exact: true });
    if (await control.count()) {
      await control.click();
      await page.waitForTimeout(350);
    }
  }
  await screenshot(page, "sidebar-hidden");
  const restore = page.getByRole("button", { name: "Ana menüyü aç", exact: true });
  if (await restore.count()) {
    await restore.click();
    await page.waitForTimeout(350);
  } else {
    addFinding("medium", "navigation", "Sidebar restore control not found after hiding");
  }

  // Dark theme: screenshot every representative module and audit DOM; accessibility on representative set.
  const darkToggle = page.getByRole("button", { name: "Koyu temaya geç", exact: true });
  if (await darkToggle.count()) {
    await darkToggle.click();
    await page.waitForTimeout(500);
    for (const label of moduleLabels) {
      if (!representativeModules.has(label)) continue;
      const button = page.locator(`nav button[aria-label=${JSON.stringify(label)}]`).first();
      if (!(await button.count())) continue;
      await button.evaluate((el) => el.click());
      await page.waitForTimeout(600);
      const dom = await domAudit(page, `${label} [dark]`);
      const file = await screenshot(page, `dark-${slug(label)}`);
      const violations = await axeAudit(page, `${label} [dark]`);
      report.darkTheme.push({ label, screenshot: file, dom, violationCount: violations.length });
    }
  } else {
    addFinding("high", "theme", "Dark theme toggle not found");
  }

  // Language switch: infer accessible buttons by title/text and verify English navigation appears.
  const langCandidates = [
    page.getByRole("button", { name: /English|EN|İngilizce/i }),
    page.locator('button[title*="English" i], button[aria-label*="English" i], button:has-text("EN")'),
  ];
  let switched = false;
  for (const candidate of langCandidates) {
    if (await candidate.count()) {
      try {
        await candidate.first().click();
        await page.waitForTimeout(450);
        if (await page.locator('nav button[aria-label="Dashboard"]').count()) {
          switched = true;
          await screenshot(page, "language-en-dashboard");
          break;
        }
      } catch {}
    }
  }
  if (!switched) addFinding("low", "i18n", "English language switch could not be verified automatically");

  await context.close();
}

async function auditResponsive(browser) {
  const viewports = [
    { name: "tablet", width: 1024, height: 768 },
    { name: "mobile-iphone", width: 390, height: 844 },
    { name: "mobile-small", width: 360, height: 740 },
  ];
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, extraHTTPHeaders: accessHeaders, colorScheme: "light" });
    await loginViaApi(context);
    const page = await context.newPage();
    attachRuntimeObservers(page);
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(900);
    const dom = await domAudit(page, `responsive:${vp.name}`);
    const file = await screenshot(page, `responsive-${vp.name}`);
    const violations = await axeAudit(page, `responsive:${vp.name}`);
    report.responsive.push({ ...vp, screenshot: file, dom, violationCount: violations.length });
    await context.close();
  }
}

async function securityAndApiChecks(browser) {
  const context = await browser.newContext({ extraHTTPHeaders: accessHeaders });
  const health = await context.request.get(`${baseUrl}/api/health`, { headers: accessHeaders });
  const healthText = await health.text();
  report.summary.healthStatus = health.status();
  try { report.summary.health = JSON.parse(healthText); } catch { report.summary.health = healthText.slice(0, 500); }
  if (health.status() !== 200) addFinding("critical", "runtime", "Health endpoint failed", `HTTP ${health.status()}`);

  const unauth = await context.request.get(`${baseUrl}/api/grc`, { headers: { ...accessHeaders, origin: baseUrl } });
  report.summary.unauthenticatedGrcStatus = unauth.status();
  if (![401, 403].includes(unauth.status())) addFinding("critical", "authz", "Unauthenticated GRC API did not reject access", `HTTP ${unauth.status()}`);

  const root = await context.request.get(baseUrl, { headers: accessHeaders });
  const headers = root.headers();
  const expectedHeaders = [
    "content-security-policy",
    "strict-transport-security",
    "x-content-type-options",
    "referrer-policy",
    "x-frame-options",
    "permissions-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
  ];
  report.summary.securityHeaders = Object.fromEntries(expectedHeaders.map((name) => [name, headers[name] || ""]));
  for (const name of expectedHeaders) {
    if (!headers[name]) addFinding("high", "security headers", `Missing ${name}`);
  }
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  if (!smokeEmail || !smokePassword) throw new Error("Fornost smoke credentials are required for full production QA.");
  if (!accessClientId || !accessClientSecret) throw new Error("Cloudflare Access service-token credentials are required for full production QA.");
  await securityAndApiChecks(browser);
  await checkLoginScreen(browser);
  await auditDesktop(browser);
  await auditResponsive(browser);
} finally {
  await browser.close();
}

if (report.consoleErrors.length) addFinding("high", "runtime", "Console errors detected", `${report.consoleErrors.length} unique errors`);
if (report.pageErrors.length) addFinding("high", "runtime", "Unhandled page errors detected", `${report.pageErrors.length} unique errors`);
if (report.failedRequests.length) addFinding("high", "network", "Failed network requests detected", `${report.failedRequests.length} unique failures`);
const serverErrors = report.httpErrors.filter((x) => x.status >= 500);
if (serverErrors.length) addFinding("critical", "network", "HTTP 5xx responses detected", `${serverErrors.length} unique responses`);

const severityRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
report.findings.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
report.summary.modulesExpected = moduleLabels.length;
report.summary.modulesPassed = report.modules.filter((x) => x.status === "ok").length;
report.summary.modulesFailed = report.modules.filter((x) => x.status !== "ok").length;
report.summary.accessibilityViolations = report.accessibility.reduce((sum, item) => sum + item.violations.length, 0);
report.summary.findingsBySeverity = report.findings.reduce((acc, item) => {
  acc[item.severity] = (acc[item.severity] || 0) + 1;
  return acc;
}, {});
report.summary.consoleErrors = report.consoleErrors.length;
report.summary.pageErrors = report.pageErrors.length;
report.summary.failedRequests = report.failedRequests.length;
report.summary.httpErrors = report.httpErrors.length;
report.finishedAt = new Date().toISOString();

await fs.writeFile(path.join(outDir, "qa-report.json"), JSON.stringify(report, null, 2));

const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const findingRows = report.findings.map((f) => `<tr><td>${escapeHtml(f.severity)}</td><td>${escapeHtml(f.area)}</td><td>${escapeHtml(f.title)}</td><td>${escapeHtml(f.detail)}</td></tr>`).join("");
const moduleRows = report.modules.map((m) => `<tr><td>${escapeHtml(m.label)}</td><td>${escapeHtml(m.status)}</td><td>${escapeHtml(m.violationCount ?? "")}</td><td>${escapeHtml(m.dom?.horizontalOverflow ? "YES" : "no")}</td><td>${escapeHtml(m.screenshot || "")}</td></tr>`).join("");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Fornost Full Production QA</title><style>body{font-family:system-ui,sans-serif;margin:28px;color:#17202a}h1,h2{margin:0 0 14px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:18px 0}.card{border:1px solid #d7dde5;border-radius:10px;padding:14px}.card b{display:block;font-size:24px;margin-top:6px}table{border-collapse:collapse;width:100%;margin:14px 0 28px}th,td{border:1px solid #d7dde5;padding:8px;text-align:left;vertical-align:top}th{background:#f5f7fa}.critical,.high{font-weight:700}.critical{color:#8b0000}.high{color:#b54708}code{background:#f4f4f4;padding:2px 4px;border-radius:4px}</style></head><body><h1>Fornost Full Production QA</h1><p><b>Target:</b> ${escapeHtml(baseUrl)}<br><b>Started:</b> ${escapeHtml(report.startedAt)}<br><b>Finished:</b> ${escapeHtml(report.finishedAt)}</p><div class="cards"><div class="card">Modules passed<b>${report.summary.modulesPassed}/${report.summary.modulesExpected}</b></div><div class="card">Accessibility violations<b>${report.summary.accessibilityViolations}</b></div><div class="card">Console errors<b>${report.summary.consoleErrors}</b></div><div class="card">Failed requests<b>${report.summary.failedRequests}</b></div><div class="card">Critical findings<b>${report.summary.findingsBySeverity.critical || 0}</b></div><div class="card">High findings<b>${report.summary.findingsBySeverity.high || 0}</b></div></div><h2>Findings</h2><table><thead><tr><th>Severity</th><th>Area</th><th>Finding</th><th>Detail</th></tr></thead><tbody>${findingRows || "<tr><td colspan=4>No findings</td></tr>"}</tbody></table><h2>Module coverage</h2><table><thead><tr><th>Module</th><th>Status</th><th>A11y violations</th><th>Horizontal overflow</th><th>Screenshot</th></tr></thead><tbody>${moduleRows}</tbody></table><h2>Runtime</h2><pre>${escapeHtml(JSON.stringify({consoleErrors:report.consoleErrors,pageErrors:report.pageErrors,failedRequests:report.failedRequests,httpErrors:report.httpErrors},null,2))}</pre></body></html>`;
await fs.writeFile(path.join(outDir, "qa-report.html"), html);

console.log("FULL_QA_SUMMARY", JSON.stringify(report.summary));
console.log(`FULL_QA_FINDINGS ${report.findings.length}`);
for (const finding of report.findings.slice(0, 40)) {
  console.log(`${finding.severity.toUpperCase()} [${finding.area}] ${finding.title}${finding.detail ? ` — ${finding.detail}` : ""}`);
}

// Fail only on runtime/security-critical defects; UI/a11y findings remain reportable for triage.
if (report.findings.some((f) => f.severity === "critical")) process.exitCode = 2;
