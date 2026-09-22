import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = (process.env.FORNOST_PROD_URL || "https://app.fornostsecurity.com").replace(/\/$/, "");
const accessClientId = process.env.CF_ACCESS_CLIENT_ID || "";
const accessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";
const smokeEmail = process.env.FORNOST_SMOKE_EMAIL || "";
const smokePassword = process.env.FORNOST_SMOKE_PASSWORD || "";
const outDir = path.resolve("qa-artifacts-v2");
const screenshotsDir = path.join(outDir, "screenshots");
const failOnHigh = String(process.env.QA_FAIL_ON_HIGH || "1") !== "0";

const moduleLabels = {
  tr: [
    "Gösterge Paneli", "Benim İşlerim", "Risk Değerlendirmesi", "Risk İştahı ve KRI",
    "İş Etki Analizi (BIA)", "İş Sürekliliği ve Dayanıklılık", "Varlık Envanteri", "Uyum Yönetimi",
    "Politika Merkezi", "Tedarikçi Yönetimi", "Kontrol Kütüphanesi", "Kanıt Kütüphanesi",
    "Kanıt Otomasyonu", "Regülasyon Merkezi", "Güvenlik Olayları ve Kriz", "Bulgular ve CAPA",
    "Denetim Yönetimi", "Bağlantılı GRC Haritası", "Raporlama", "AI Yönetişimi", "Ask Fornost",
    "Sistem Ayarları", "AI Ayarları", "Ana Veri Yönetimi", "İş Akışı Entegrasyonları",
    "E-posta ve Bildirimler", "Kimlik ve Erişim",
  ],
  en: [
    "Dashboard", "My Work", "Risk Assessment", "Risk Appetite & KRI",
    "Business Impact Analysis (BIA)", "Business Continuity & Resilience", "Asset Inventory", "Compliance Management",
    "Policy Center", "Vendor Management", "Control Library", "Evidence Library", "Evidence Automation",
    "Regulatory Change Center", "Security Incidents & Crisis", "Findings & CAPA", "Audit Management",
    "Connected GRC Map", "Reporting", "AI Governance", "Ask Fornost", "System Settings", "AI Settings",
    "Master Data", "Workflow Integrations", "Email & Notifications", "Identity & Access",
  ],
};

const representativeIndexes = [0, 2, 4, 6, 7, 10, 11, 16, 17, 18, 19, 21, 25, 26];
const accessHeaders = {};
if (accessClientId && accessClientSecret) {
  accessHeaders["CF-Access-Client-Id"] = accessClientId;
  accessHeaders["CF-Access-Client-Secret"] = accessClientSecret;
}

const report = {
  version: "2.0",
  startedAt: new Date().toISOString(),
  baseUrl,
  environment: {},
  locales: { tr: [], en: [] },
  responsive: [],
  sidebar: {},
  themes: [],
  accessibility: [],
  runtime: { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] },
  securityHeaders: {},
  findings: [],
  summary: {},
};

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(screenshotsDir, { recursive: true });

const severityWeight = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
function finding(severity, area, title, detail = "", evidence = "") {
  report.findings.push({ severity, area, title, detail, evidence });
}
function uniquePush(list, value, key = JSON.stringify(value)) {
  if (!list.some((item) => JSON.stringify(item) === key)) list.push(value);
}
function slug(value) {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 90) || "screen";
}
async function snap(page, name, fullPage = false) {
  const file = path.join(screenshotsDir, `${slug(name)}.png`);
  await page.screenshot({ path: file, fullPage, animations: "disabled" });
  return path.relative(outDir, file);
}
function observe(page) {
  page.on("console", (msg) => {
    if (msg.type() === "error") uniquePush(report.runtime.consoleErrors, { url: page.url(), text: msg.text() });
  });
  page.on("pageerror", (err) => uniquePush(report.runtime.pageErrors, { url: page.url(), message: err.message }));
  page.on("requestfailed", (req) => uniquePush(report.runtime.failedRequests, { url: req.url(), method: req.method(), error: req.failure()?.errorText || "unknown" }));
  page.on("response", (res) => {
    if (res.status() >= 400) uniquePush(report.runtime.httpErrors, { url: res.url(), status: res.status() });
  });
}
async function login(context) {
  const res = await context.request.post(`${baseUrl}/api/auth`, {
    headers: { ...accessHeaders, origin: baseUrl, "content-type": "application/json" },
    data: { action: "login", email: smokeEmail, password: smokePassword },
  });
  const text = await res.text();
  if (res.status() !== 200) throw new Error(`Smoke login failed HTTP ${res.status()}: ${text.slice(0, 500)}`);
}

async function axeAudit(page, area) {
  try {
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const violations = result.violations.map((v) => ({
      id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, nodeCount: v.nodes.length,
      nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target, failureSummary: n.failureSummary })),
    }));
    report.accessibility.push({ area, violations });
    for (const v of violations) {
      const severity = v.impact === "critical" ? "critical" : v.impact === "serious" ? "high" : v.impact === "moderate" ? "medium" : "low";
      finding(severity, area, `Accessibility: ${v.id}`, `${v.help}; nodes=${v.nodeCount}`, v.helpUrl);
    }
    return violations.length;
  } catch (error) {
    finding("medium", area, "Axe audit failed", error.message);
    return -1;
  }
}

async function domAudit(page, area, locale) {
  const data = await page.evaluate(() => {
    const visible = (el) => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const nameOf = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
    const controls = [...document.querySelectorAll("button,a,input,select,textarea")].filter(visible);
    const emptyButtons = [...document.querySelectorAll("button")].filter(visible).filter((el) => !nameOf(el)).map((el) => el.outerHTML.slice(0, 250));
    const emptyLinks = [...document.querySelectorAll("a")].filter(visible).filter((el) => !nameOf(el) && !el.querySelector("img[alt],svg[aria-label]")).map((el) => el.outerHTML.slice(0, 250));
    const unlabeled = [...document.querySelectorAll("input,select,textarea")].filter(visible).filter((el) => {
      const explicit = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      return !explicit && !el.closest("label") && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby");
    }).map((el) => ({ tag: el.tagName, type: el.getAttribute("type"), name: el.getAttribute("name"), placeholder: el.getAttribute("placeholder") }));
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    const orphanLabels = [...document.querySelectorAll("label[for]")].filter(visible).filter((label) => !document.getElementById(label.htmlFor)).map((label) => ({ for: label.htmlFor, text: label.textContent?.trim() }));
    const numberInputs = [...document.querySelectorAll('input[type="number"]')].filter(visible).map((el) => ({ name: el.name, min: el.getAttribute("min"), max: el.getAttribute("max"), step: el.getAttribute("step") }));
    const invalidNumericRanges = numberInputs.filter((x) => x.min !== null && x.max !== null && Number(x.min) > Number(x.max));
    const brokenImages = [...document.images].filter(visible).filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.currentSrc || img.src || img.alt);
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible).map((el) => ({
      modal: el.getAttribute("aria-modal"), labelledby: el.getAttribute("aria-labelledby"), label: el.getAttribute("aria-label"), text: (el.textContent || "").trim().slice(0, 120),
    }));
    const tables = [...document.querySelectorAll("table")].filter(visible).map((table, index) => {
      const rows = table.querySelectorAll("tbody tr").length;
      const headers = table.querySelectorAll("thead th, tr th").length;
      const wrapper = table.closest(".table-wrap,[role=region]");
      const rect = table.getBoundingClientRect();
      const wrapperRect = wrapper?.getBoundingClientRect();
      const clippedWithoutScroller = !!wrapperRect && rect.width > wrapperRect.width + 4 && getComputedStyle(wrapper).overflowX === "visible";
      return { index, rows, headers, clippedWithoutScroller, caption: table.querySelector("caption")?.textContent?.trim() || "", ariaLabel: table.getAttribute("aria-label") || "" };
    });
    const pageOverflow = document.documentElement.scrollWidth > innerWidth + 4;
    const navLabels = [...document.querySelectorAll("nav button[aria-label]")].filter(visible).map((el) => el.getAttribute("aria-label"));
    const visibleUiText = [...document.querySelectorAll("button,label,th,[role=tab],[role=menuitem]")].filter(visible).map((el) => (el.textContent || el.getAttribute("aria-label") || "").trim()).filter(Boolean);
    return {
      title: document.title, lang: document.documentElement.lang, h1: [...document.querySelectorAll("h1")].find(visible)?.textContent?.trim() || "",
      controls: controls.length, emptyButtons, emptyLinks, unlabeled, duplicateIds, orphanLabels, invalidNumericRanges, brokenImages, dialogs, tables,
      pageOverflow, overflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth), navLabels, visibleUiText,
      forms: document.querySelectorAll("form").length,
      records: tables.reduce((sum, t) => sum + t.rows, 0),
    };
  });

  if (data.pageOverflow) finding("high", area, "Horizontal page overflow", `${data.overflowPx}px beyond viewport`);
  if (data.emptyButtons.length) finding("high", area, "Visible buttons without accessible name", JSON.stringify(data.emptyButtons.slice(0, 6)));
  if (data.emptyLinks.length) finding("medium", area, "Visible links without accessible name", JSON.stringify(data.emptyLinks.slice(0, 6)));
  if (data.unlabeled.length) finding("high", area, "Visible form controls without label", JSON.stringify(data.unlabeled.slice(0, 10)));
  if (data.duplicateIds.length) finding("high", area, "Duplicate DOM IDs", data.duplicateIds.join(", "));
  if (data.orphanLabels.length) finding("medium", area, "Labels point to missing form controls", JSON.stringify(data.orphanLabels.slice(0, 10)));
  if (data.invalidNumericRanges.length) finding("high", area, "Invalid numeric input range", JSON.stringify(data.invalidNumericRanges));
  if (data.brokenImages.length) finding("high", area, "Broken visible images", data.brokenImages.join(", "));
  for (const [index, dialog] of data.dialogs.entries()) {
    if (dialog.modal !== "true") finding("medium", area, `Dialog ${index + 1} is missing aria-modal=true`, dialog.text);
    if (!dialog.labelledby && !dialog.label) finding("high", area, `Dialog ${index + 1} has no accessible name`, dialog.text);
  }
  for (const table of data.tables) {
    if (!table.headers) finding("high", area, `Table ${table.index + 1} has no header cells`);
    if (table.clippedWithoutScroller) finding("high", area, `Table ${table.index + 1} is clipped without horizontal scrolling`);
  }

  const forbidden = locale === "en"
    ? ["Kaydet", "İptal", "Sil", "Düzenle", "Kapat", "Filtreler", "Gösterge Paneli", "Benim İşlerim"]
    : ["Save", "Cancel", "Delete", "Edit", "Close", "Filters", "Dashboard", "My Work"];
  const mixed = data.visibleUiText.filter((text) => forbidden.includes(text));
  if (mixed.length) finding("medium", `${area}:i18n`, "Mixed-language UI controls detected", [...new Set(mixed)].join(", "));
  const expectedLang = locale === "tr" ? "tr" : "en";
  if (!String(data.lang || "").toLowerCase().startsWith(expectedLang)) finding("medium", `${area}:i18n`, "HTML lang does not match selected locale", `expected=${expectedLang}, actual=${data.lang || "empty"}`);
  return data;
}

async function currentLocale(page) {
  if (await page.locator('nav button[aria-label="Dashboard"]').count()) return "en";
  if (await page.locator('nav button[aria-label="Gösterge Paneli"]').count()) return "tr";
  return "unknown";
}
async function setLocale(page, locale) {
  if ((await currentLocale(page)) === locale) return true;
  const regex = locale === "en" ? /^(EN|English|İngilizce)$/i : /^(TR|Türkçe|Turkish)$/i;
  const candidates = [
    page.getByRole("button", { name: regex }),
    page.locator("button").filter({ hasText: regex }),
    page.locator(locale === "en" ? 'button[title*="English" i],button[aria-label*="English" i]' : 'button[title*="Türk" i],button[aria-label*="Türk" i]'),
  ];
  for (const locator of candidates) {
    const count = await locator.count();
    if (!count) continue;
    try {
      await locator.first().click();
      await page.waitForTimeout(450);
      if ((await currentLocale(page)) === locale) return true;
    } catch {}
  }
  return false;
}

async function auditLocale(page, locale) {
  if (!(await setLocale(page, locale))) {
    finding("high", "i18n", `Could not switch application to ${locale.toUpperCase()}`);
    return;
  }
  const expected = moduleLabels[locale];
  const opposite = moduleLabels[locale === "tr" ? "en" : "tr"];
  const actual = await page.locator("nav button[aria-label]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")).filter(Boolean));
  for (const label of expected) if (!actual.includes(label)) finding("high", `navigation:${locale}`, "Expected module label missing", label);
  const leaked = opposite.filter((label) => actual.includes(label));
  if (leaked.length) finding("high", `navigation:${locale}`, "Opposite-language module labels remain visible", leaked.join(", "));

  for (let i = 0; i < expected.length; i += 1) {
    const label = expected[i];
    const button = page.locator(`nav button[aria-label=${JSON.stringify(label)}]`).first();
    if (!(await button.count())) continue;
    try {
      await button.evaluate((el) => el.click());
      await page.waitForTimeout(450);
      const area = `${locale}:${label}`;
      const dom = await domAudit(page, area, locale);
      const a11y = await axeAudit(page, area);
      let screenshot = "";
      if (representativeIndexes.includes(i)) screenshot = await snap(page, `${locale}-${label}`);
      report.locales[locale].push({ label, status: "ok", dom, a11y, screenshot });
    } catch (error) {
      report.locales[locale].push({ label, status: "error", error: error.message });
      finding("high", `${locale}:${label}`, "Module navigation/render failed", error.message);
    }
  }
}

async function auditSidebar(page) {
  await setLocale(page, "tr");
  const collapse = page.getByRole("button", { name: /Menüyü daralt|Collapse menu/i }).first();
  if (!(await collapse.count())) {
    finding("high", "sidebar", "Collapse control not found");
    return;
  }
  await collapse.click();
  await page.waitForTimeout(250);
  const navButtons = page.locator("nav button[aria-label]");
  const count = await navButtons.count();
  const tooltipChecks = [];
  for (let i = 0; i < Math.min(count, 5); i += 1) {
    const button = navButtons.nth(i), label = await button.getAttribute("aria-label");
    if (!label) continue;
    await button.hover();
    await page.waitForTimeout(120);
    const hoverTooltip = page.locator('[role="tooltip"]:visible').filter({ hasText: label });
    const hoverOk = (await hoverTooltip.count()) > 0;
    await button.focus();
    await page.waitForTimeout(120);
    const focusTooltip = page.locator('[role="tooltip"]:visible').filter({ hasText: label });
    const focusOk = (await focusTooltip.count()) > 0;
    tooltipChecks.push({ label, hoverOk, focusOk });
    if (!hoverOk) finding("high", "sidebar", "Collapsed navigation icon has no hover tooltip", label);
    if (!focusOk) finding("high", "sidebar", "Collapsed navigation icon has no keyboard-focus tooltip", label);
  }
  report.sidebar.tooltipChecks = tooltipChecks;
  report.sidebar.compactScreenshot = await snap(page, "sidebar-compact");

  const hide = page.getByRole("button", { name: /Menüyü gizle|Hide menu/i }).first();
  if (await hide.count()) {
    await hide.click();
    await page.waitForTimeout(250);
    report.sidebar.hiddenScreenshot = await snap(page, "sidebar-hidden");
    const restore = page.getByRole("button", { name: /Ana menüyü aç|Open main menu/i }).first();
    if (await restore.count()) await restore.click(); else finding("high", "sidebar", "Hidden sidebar cannot be restored");
  } else {
    finding("medium", "sidebar", "Hide-menu control not found in compact mode");
  }
}

async function auditTheme(page) {
  await setLocale(page, "tr");
  const toggle = page.getByRole("button", { name: /Koyu temaya geç|Switch to dark|Dark theme/i }).first();
  if (!(await toggle.count())) {
    finding("high", "theme", "Dark theme toggle not found");
    return;
  }
  await toggle.click();
  await page.waitForTimeout(350);
  const computed = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color, className: document.documentElement.className }));
  report.themes.push({ theme: "dark", computed, screenshot: await snap(page, "theme-dark-dashboard") });
  const lightToggle = page.getByRole("button", { name: /Açık temaya geç|Switch to light|Light theme/i }).first();
  if (await lightToggle.count()) await lightToggle.click();
}

async function auditResponsive(browser) {
  const viewports = [
    { name: "tablet", width: 1024, height: 768 },
    { name: "mobile", width: 390, height: 844 },
    { name: "mobile-small", width: 360, height: 740 },
  ];
  for (const vp of viewports) {
    for (const locale of ["tr", "en"]) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, extraHTTPHeaders: accessHeaders, colorScheme: "light" });
      await login(context);
      const page = await context.newPage();
      observe(page);
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(800);
      if (!(await setLocale(page, locale))) finding("high", `responsive:${vp.name}`, `Locale switch failed: ${locale}`);
      const dom = await domAudit(page, `responsive:${vp.name}:${locale}`, locale);
      const a11y = await axeAudit(page, `responsive:${vp.name}:${locale}`);
      const screenshot = await snap(page, `responsive-${vp.name}-${locale}`);
      report.responsive.push({ ...vp, locale, dom, a11y, screenshot });
      await context.close();
    }
  }
}

async function apiAndHeaderAudit(browser) {
  const context = await browser.newContext({ extraHTTPHeaders: accessHeaders });
  const root = await context.request.get(baseUrl, { headers: accessHeaders });
  const headers = root.headers();
  const required = ["content-security-policy", "strict-transport-security", "x-content-type-options", "referrer-policy", "x-frame-options", "permissions-policy", "cross-origin-opener-policy", "cross-origin-resource-policy"];
  for (const name of required) {
    report.securityHeaders[name] = headers[name] || "";
    if (!headers[name]) finding("high", "security-headers", `Missing ${name}`);
  }
  const unauth = await context.request.get(`${baseUrl}/api/grc`, { headers: { ...accessHeaders, origin: baseUrl } });
  if (![401, 403].includes(unauth.status())) finding("critical", "authz", "Unauthenticated /api/grc access was not rejected", `HTTP ${unauth.status()}`);
  const health = await context.request.get(`${baseUrl}/api/health`, { headers: accessHeaders });
  if (health.status() !== 200) finding("critical", "runtime", "/api/health failed", `HTTP ${health.status()}`);
  report.summary.healthStatus = health.status();
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  if (!smokeEmail || !smokePassword) throw new Error("Fornost smoke credentials are required.");
  if (!accessClientId || !accessClientSecret) throw new Error("Cloudflare Access service-token credentials are required.");
  await apiAndHeaderAudit(browser);
  const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, extraHTTPHeaders: accessHeaders, colorScheme: "light" });
  await login(context);
  const page = await context.newPage();
  observe(page);
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(900);
  report.environment = await page.evaluate(() => ({ userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio, title: document.title, lang: document.documentElement.lang }));
  await auditLocale(page, "tr");
  await auditSidebar(page);
  await auditTheme(page);
  await auditLocale(page, "en");
  await context.close();
  await auditResponsive(browser);
} finally {
  await browser.close();
}

if (report.runtime.consoleErrors.length) finding("high", "runtime", "Browser console errors detected", `${report.runtime.consoleErrors.length} unique errors`);
if (report.runtime.pageErrors.length) finding("high", "runtime", "Unhandled page errors detected", `${report.runtime.pageErrors.length} unique errors`);
if (report.runtime.failedRequests.length) finding("high", "network", "Failed browser requests detected", `${report.runtime.failedRequests.length} unique failures`);
const serverErrors = report.runtime.httpErrors.filter((item) => item.status >= 500);
if (serverErrors.length) finding("critical", "network", "HTTP 5xx responses detected", `${serverErrors.length} unique responses`);

report.findings.sort((a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0));
report.summary.modulesExpectedPerLocale = moduleLabels.tr.length;
report.summary.trModulesPassed = report.locales.tr.filter((x) => x.status === "ok").length;
report.summary.enModulesPassed = report.locales.en.filter((x) => x.status === "ok").length;
report.summary.accessibilityViolations = report.accessibility.reduce((sum, item) => sum + Math.max(0, item.violations.length), 0);
report.summary.findingsBySeverity = report.findings.reduce((acc, item) => ({ ...acc, [item.severity]: (acc[item.severity] || 0) + 1 }), {});
report.summary.consoleErrors = report.runtime.consoleErrors.length;
report.summary.pageErrors = report.runtime.pageErrors.length;
report.summary.failedRequests = report.runtime.failedRequests.length;
report.summary.httpErrors = report.runtime.httpErrors.length;
report.finishedAt = new Date().toISOString();

await fs.writeFile(path.join(outDir, "qa-report-v2.json"), JSON.stringify(report, null, 2));
const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[char]));
const findingRows = report.findings.map((f) => `<tr><td>${esc(f.severity)}</td><td>${esc(f.area)}</td><td>${esc(f.title)}</td><td>${esc(f.detail)}</td></tr>`).join("");
const localeRows = ["tr", "en"].flatMap((locale) => report.locales[locale].map((m) => `<tr><td>${locale.toUpperCase()}</td><td>${esc(m.label)}</td><td>${esc(m.status)}</td><td>${esc(m.dom?.forms ?? "")}</td><td>${esc(m.dom?.tables?.length ?? "")}</td><td>${esc(m.dom?.records ?? "")}</td><td>${esc(m.a11y ?? "")}</td></tr>`)).join("");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Fornost Full Product QA v2</title><style>body{font-family:system-ui,sans-serif;margin:24px;color:#17202a}table{border-collapse:collapse;width:100%;margin:14px 0 28px}th,td{border:1px solid #d7dde5;padding:8px;text-align:left;vertical-align:top}th{background:#f5f7fa}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.card{border:1px solid #d7dde5;border-radius:10px;padding:12px}.card b{font-size:24px;display:block}</style></head><body><h1>Fornost Full Product QA v2</h1><p>${esc(baseUrl)} · ${esc(report.startedAt)} → ${esc(report.finishedAt)}</p><div class="cards"><div class="card">TR modules<b>${report.summary.trModulesPassed}/${report.summary.modulesExpectedPerLocale}</b></div><div class="card">EN modules<b>${report.summary.enModulesPassed}/${report.summary.modulesExpectedPerLocale}</b></div><div class="card">A11y violations<b>${report.summary.accessibilityViolations}</b></div><div class="card">Critical<b>${report.summary.findingsBySeverity.critical || 0}</b></div><div class="card">High<b>${report.summary.findingsBySeverity.high || 0}</b></div></div><h2>Findings</h2><table><thead><tr><th>Severity</th><th>Area</th><th>Finding</th><th>Detail</th></tr></thead><tbody>${findingRows || "<tr><td colspan=4>No findings</td></tr>"}</tbody></table><h2>Modules / forms / tables / records</h2><table><thead><tr><th>Lang</th><th>Module</th><th>Status</th><th>Forms</th><th>Tables</th><th>Rows</th><th>A11y</th></tr></thead><tbody>${localeRows}</tbody></table><h2>Runtime</h2><pre>${esc(JSON.stringify(report.runtime, null, 2))}</pre></body></html>`;
await fs.writeFile(path.join(outDir, "qa-report-v2.html"), html);

console.log("FULL_QA_V2_SUMMARY", JSON.stringify(report.summary));
for (const f of report.findings.slice(0, 80)) console.log(`${f.severity.toUpperCase()} [${f.area}] ${f.title}${f.detail ? ` — ${f.detail}` : ""}`);
if (report.findings.some((f) => f.severity === "critical") || (failOnHigh && report.findings.some((f) => f.severity === "high"))) process.exitCode = 2;
