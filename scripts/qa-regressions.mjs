import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = (process.env.FORNOST_PROD_URL || "https://app.fornostsecurity.com").replace(/\/$/, "");
const prodOrigin = new URL(baseUrl).origin;
const accessClientId = process.env.CF_ACCESS_CLIENT_ID || "";
const accessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";
const smokeEmail = process.env.FORNOST_SMOKE_EMAIL || "";
const smokePassword = process.env.FORNOST_SMOKE_PASSWORD || "";
const outDir = path.resolve("qa-artifacts-full-product", "regressions");

await fs.mkdir(outDir, { recursive: true });

const results = { generatedAt: new Date().toISOString(), baseUrl, checks: [], failures: [] };
const pass = (name, detail = "") => results.checks.push({ name, status: "pass", detail });
const fail = (name, detail = "") => {
  results.checks.push({ name, status: "fail", detail });
  results.failures.push({ name, detail });
};
const accessHeaders = () => accessClientId && accessClientSecret ? {
  "CF-Access-Client-Id": accessClientId,
  "CF-Access-Client-Secret": accessClientSecret,
} : {};

async function wireAccess(context) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    let sameOrigin = false;
    try { sameOrigin = new URL(request.url()).origin === prodOrigin; } catch {}
    if (!sameOrigin) return route.continue();
    await route.continue({ headers: { ...request.headers(), ...accessHeaders() } });
  });
}

async function login(context) {
  const response = await context.request.post(`${baseUrl}/api/auth`, {
    headers: { ...accessHeaders(), origin: baseUrl, "content-type": "application/json" },
    data: { action: "login", email: smokeEmail, password: smokePassword },
  });
  if (response.status() !== 200) throw new Error(`Smoke login failed: HTTP ${response.status()}`);
}

async function clickModule(page, label) {
  const button = page.locator(`nav button[aria-label=${JSON.stringify(label)}]`).first();
  if (!(await button.count())) throw new Error(`Navigation button not found: ${label}`);
  await button.evaluate((element) => element.click());
  await page.waitForTimeout(450);
}

async function textClipState(page, selector) {
  return page.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      text: (element.textContent || "").trim().slice(0, 240),
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflow: style.overflow,
      overflowY: style.overflowY,
      visibleBottom: Math.round(rect.bottom),
      viewportHeight: innerHeight,
      clipped: element.scrollHeight > element.clientHeight + 2,
    };
  });
}

async function dashboardVisualState(page, theme) {
  await page.evaluate((nextTheme) => {
    document.documentElement.dataset.theme = nextTheme;
  }, theme);
  await page.waitForTimeout(120);

  const score = await page.locator(".executive-assurance-score strong").first().evaluate((element) => {
    const text = (element.textContent || "").trim();
    const rect = element.getBoundingClientRect();
    return {
      text,
      childElements: element.children.length,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowX: element.scrollWidth > element.clientWidth + 1,
      overflowY: element.scrollHeight > element.clientHeight + 1,
    };
  }).catch(() => null);

  const workspace = await page.locator(".dashboard-shortcuts").first().evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      display: style.display,
      visibility: style.visibility,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
    };
  }).catch(() => ({ display: "absent", visibility: "absent", width: 0, height: 0, visible: false }));

  return { score, workspace };
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  await wireAccess(context);
  await login(context);
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(900);

  // Regression: the dashboard score must be a single baseline-safe token in both themes,
  // and the retired WORKSPACES launcher must not occupy any visible layout space.
  for (const theme of ["light", "dark"]) {
    const dashboard = await dashboardVisualState(page, theme);
    const scoreOk = dashboard.score
      && /^\d+\/100$/.test(dashboard.score.text)
      && dashboard.score.childElements === 0
      && !dashboard.score.overflowX
      && !dashboard.score.overflowY;
    if (scoreOk) pass(`Composite assurance score is baseline-safe [${theme}]`, JSON.stringify(dashboard.score));
    else fail(`Composite assurance score is baseline-safe [${theme}]`, JSON.stringify(dashboard.score));

    if (!dashboard.workspace.visible) pass(`Dashboard WORKSPACES strip is absent from visible UI [${theme}]`, JSON.stringify(dashboard.workspace));
    else fail(`Dashboard WORKSPACES strip is absent from visible UI [${theme}]`, JSON.stringify(dashboard.workspace));

    await page.screenshot({ path: path.join(outDir, `dashboard-visual-contract-${theme}.png`), fullPage: true, animations: "disabled" });
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });

  // Regression: Ask Fornost must not cover a normal module after navigation.
  await clickModule(page, "Ask Fornost");
  const opened = await page.locator("#fornost-ai-panel").count();
  if (opened) pass("AI workspace opens from navigation");
  else fail("AI workspace opens from navigation", "#fornost-ai-panel was not rendered");

  await clickModule(page, "Sistem Ayarları");
  const panelAfterNormalNav = await page.locator("#fornost-ai-panel").count();
  const activeAfterNormalNav = await page.locator("nav button.active").first().getAttribute("aria-label").catch(() => null);
  if (!panelAfterNormalNav && activeAfterNormalNav === "Sistem Ayarları") {
    pass("AI workspace closes on normal module navigation", `active=${activeAfterNormalNav}`);
  } else {
    fail("AI workspace closes on normal module navigation", `panel=${panelAfterNormalNav}; active=${activeAfterNormalNav || "none"}`);
  }
  await page.screenshot({ path: path.join(outDir, "mobile-system-settings-after-ai.png"), fullPage: false, animations: "disabled" });

  // Regression: mobile hero explanatory copy must not be physically clipped.
  await clickModule(page, "İş Sürekliliği ve Dayanıklılık");
  const continuity = await textClipState(page, ".continuity-hero p");
  if (!continuity.clipped) pass("Continuity mobile hero copy is not clipped", JSON.stringify(continuity));
  else fail("Continuity mobile hero copy is not clipped", JSON.stringify(continuity));
  await page.screenshot({ path: path.join(outDir, "mobile-continuity-hero.png"), fullPage: false, animations: "disabled" });

  await clickModule(page, "Bağlantılı GRC Haritası");
  const connected = await textClipState(page, ".connected-hero p");
  if (!connected.clipped) pass("Connected GRC mobile hero copy is not clipped", JSON.stringify(connected));
  else fail("Connected GRC mobile hero copy is not clipped", JSON.stringify(connected));
  await page.screenshot({ path: path.join(outDir, "mobile-connected-grc-hero.png"), fullPage: false, animations: "disabled" });

  // Regression: Evidence Automation tab rail must be an intentional horizontal scroller.
  await clickModule(page, "Kanıt Otomasyonu");
  const tabs = await page.locator(".ea-tabs").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { overflowX: style.overflowX, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
  });
  if (["auto", "scroll"].includes(tabs.overflowX)) pass("Evidence Automation tabs are horizontally scrollable", JSON.stringify(tabs));
  else fail("Evidence Automation tabs are horizontally scrollable", JSON.stringify(tabs));

  // Regression: visible Master Data footer copy must obey the 11px readability floor.
  await clickModule(page, "Ana Veri Yönetimi");
  const footerSizes = await page.evaluate(() => [...document.querySelectorAll("main footer, .catalog-manager footer, .catalog-grid footer")]
    .flatMap((footer) => [footer, ...footer.querySelectorAll("*")])
    .filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && (element.textContent || "").trim();
    })
    .map((element) => ({ text: (element.textContent || "").trim().slice(0, 120), size: parseFloat(getComputedStyle(element).fontSize) }))
    .filter((item) => Number.isFinite(item.size)));
  const minFooter = footerSizes.length ? Math.min(...footerSizes.map((item) => item.size)) : 999;
  if (minFooter >= 11) pass("Master Data footer meets 11px readability floor", `min=${minFooter}px`);
  else fail("Master Data footer meets 11px readability floor", `min=${minFooter}px; ${JSON.stringify(footerSizes.filter((item) => item.size < 11).slice(0, 10))}`);

  // Regression: target the actual language switch, not unrelated controls whose accessible name contains "en".
  const english = page.locator(".language-switch button").filter({ hasText: /^EN$/ }).first();
  if (await english.count()) {
    await english.click().catch(async () => english.evaluate((element) => element.click()));
    await page.waitForTimeout(350);
    const lang = await page.locator("html").getAttribute("lang");
    const dashboard = await page.locator('nav button[aria-label="Dashboard"]').count();
    const activeLanguage = await page.locator(".language-switch button.active").first().textContent().catch(() => null);
    if (lang === "en" && dashboard && activeLanguage?.trim() === "EN") {
      pass("English language switch changes HTML and navigation", `lang=${lang}; active=${activeLanguage.trim()}`);
    } else {
      fail("English language switch changes HTML and navigation", `lang=${lang}; dashboard=${dashboard}; active=${activeLanguage || "none"}`);
    }
  } else {
    fail("English language switch changes HTML and navigation", "Exact EN language control not found");
  }

  await context.close();
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outDir, "qa-regressions.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.failures.length) process.exitCode = 1;
