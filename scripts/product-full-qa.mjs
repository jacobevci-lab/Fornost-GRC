import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = (process.env.FORNOST_PROD_URL || "https://app.fornostsecurity.com").replace(/\/$/, "");
const prodOrigin = new URL(baseUrl).origin;
const accessClientId = process.env.CF_ACCESS_CLIENT_ID || "";
const accessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";
const smokeEmail = process.env.FORNOST_SMOKE_EMAIL || "";
const smokePassword = process.env.FORNOST_SMOKE_PASSWORD || "";
const outDir = path.resolve("qa-artifacts-full-product");
const screenshotsDir = path.join(outDir, "screenshots");

const moduleLabels = [
  "Gösterge Paneli", "Benim İşlerim", "Risk Değerlendirmesi", "Risk İştahı ve KRI",
  "İş Etki Analizi (BIA)", "İş Sürekliliği ve Dayanıklılık", "Varlık Envanteri",
  "Uyum Yönetimi", "Politika Merkezi", "Tedarikçi Yönetimi", "Kontrol Kütüphanesi",
  "Kanıt Kütüphanesi", "Kanıt Otomasyonu", "Regülasyon Merkezi",
  "Güvenlik Olayları ve Kriz", "Bulgular ve CAPA", "Denetim Yönetimi",
  "Bağlantılı GRC Haritası", "Raporlama", "AI Yönetişimi", "Ask Fornost",
  "Sistem Ayarları", "AI Ayarları", "Ana Veri Yönetimi", "İş Akışı Entegrasyonları",
  "E-posta ve Bildirimler", "Kimlik ve Erişim",
];

const matrices = [
  { name: "desktop-light", width: 1536, height: 960, theme: "light" },
  { name: "desktop-dark", width: 1536, height: 960, theme: "dark" },
  { name: "tablet-light", width: 1024, height: 768, theme: "light" },
  { name: "mobile-light", width: 390, height: 844, theme: "light" },
  { name: "mobile-dark", width: 390, height: 844, theme: "dark" },
  { name: "mobile-small-light", width: 360, height: 740, theme: "light" },
];

const report = {
  startedAt: new Date().toISOString(), baseUrl, source: {}, api: [], matrices: [],
  consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [], findings: [], summary: {},
};

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(screenshotsDir, { recursive: true });

function slug(v) {
  return String(v).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 90) || "screen";
}
function addFinding(severity, area, title, detail = "", evidence = "") {
  report.findings.push({ severity, area, title, detail, evidence });
}
function uniquePush(arr, item, keyFn = (x) => JSON.stringify(x)) {
  const key = keyFn(item); if (!arr.some((x) => keyFn(x) === key)) arr.push(item);
}
function accessHeaders() {
  return accessClientId && accessClientSecret ? {
    "CF-Access-Client-Id": accessClientId,
    "CF-Access-Client-Secret": accessClientSecret,
  } : {};
}
async function wireAccess(context) {
  await context.route("**/*", async (route) => {
    const req = route.request();
    let sameOrigin = false;
    try { sameOrigin = new URL(req.url()).origin === prodOrigin; } catch {}
    if (!sameOrigin) return route.continue();
    await route.continue({ headers: { ...req.headers(), ...accessHeaders() } });
  });
}
async function login(context) {
  const r = await context.request.post(`${baseUrl}/api/auth`, {
    headers: { ...accessHeaders(), origin: baseUrl, "content-type": "application/json" },
    data: { action: "login", email: smokeEmail, password: smokePassword },
  });
  const text = await r.text();
  if (r.status() !== 200) throw new Error(`Login failed HTTP ${r.status()}: ${text.slice(0, 300)}`);
}
function observe(page) {
  page.on("console", (m) => { if (m.type() === "error") uniquePush(report.consoleErrors, { text: m.text(), url: page.url() }, x => `${x.text}|${x.url}`); });
  page.on("pageerror", (e) => uniquePush(report.pageErrors, { message: e.message, url: page.url() }, x => `${x.message}|${x.url}`));
  page.on("requestfailed", (r) => uniquePush(report.failedRequests, { url: r.url(), method: r.method(), failure: r.failure()?.errorText || "unknown" }, x => `${x.method}|${x.url}|${x.failure}`));
  page.on("response", (r) => { if (r.status() >= 400) uniquePush(report.httpErrors, { status: r.status(), url: r.url() }, x => `${x.status}|${x.url}`); });
}

async function sourceAudit() {
  const walk = async (dir) => {
    const out = [];
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", ".vinext", ".next", "dist", "qa-artifacts", "qa-artifacts-full-product"].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
    }
    return out;
  };
  const files = await walk(process.cwd());
  const cssFiles = files.filter(f => f.endsWith(".css"));
  const tsxFiles = files.filter(f => /\.(tsx|ts|jsx|js)$/.test(f));
  const routeFiles = files.filter(f => /app[\\/]api[\\/].*[\\/]route\.ts$/.test(f));
  const testFiles = files.filter(f => /[\\/]tests[\\/].*\.test\./.test(f));
  const cssFindings = [];
  let importantCount = 0;
  let hardcodedColorCount = 0;
  const fontFamilies = new Map();
  for (const f of cssFiles) {
    const text = await fs.readFile(f, "utf8");
    importantCount += (text.match(/!important/g) || []).length;
    hardcodedColorCount += (text.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
    for (const m of text.matchAll(/font-size\s*:\s*([0-9.]+)px/gi)) {
      const px = Number(m[1]);
      if (px < 11) cssFindings.push({ file: path.relative(process.cwd(), f), value: `${px}px`, kind: "tiny-font" });
    }
    for (const m of text.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
      const value = m[1].trim(); fontFamilies.set(value, (fontFamilies.get(value) || 0) + 1);
    }
  }
  if (cssFindings.length) addFinding("medium", "css-source", "Tiny font declarations below 11px", `${cssFindings.length} declarations`, JSON.stringify(cssFindings.slice(0, 20)));

  const routes = [];
  for (const f of routeFiles) {
    const text = await fs.readFile(f, "utf8");
    const methods = [...new Set([...text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)].map(m => m[1]))];
    const rel = path.relative(process.cwd(), f).replaceAll(path.sep, "/");
    const urlPath = "/" + rel.replace(/^app\//, "").replace(/\/route\.ts$/, "").replace(/\[\.\.\.[^\]]+\]/g, "").replace(/\[[^\]]+\]/g, "test");
    routes.push({ file: rel, urlPath, methods });
    if (!methods.length) addFinding("low", "backend-source", "API route without detectable exported HTTP method", rel);
  }
  report.source = {
    fileCount: files.length, cssFiles: cssFiles.length, codeFiles: tsxFiles.length,
    apiRouteFiles: routeFiles.length, tests: testFiles.length, importantCount, hardcodedColorCount,
    fontFamilies: [...fontFamilies.entries()].sort((a,b) => b[1]-a[1]).slice(0, 20), cssFindings, routes,
  };
  return routes;
}

async function deepDomProbe(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const hasScrollAncestor = (el, axis = "x") => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const s = getComputedStyle(p); const v = axis === "x" ? s.overflowX : s.overflowY;
        if (["auto", "scroll"].includes(v)) return true;
        p = p.parentElement;
      }
      return false;
    };
    const txt = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
    const all = [...document.querySelectorAll("body *")].filter(visible);
    const textEls = all.filter(el => txt(el).length > 0 && !["SCRIPT","STYLE","SVG","PATH"].includes(el.tagName));
    const controls = all.filter(el => ["BUTTON","A","INPUT","SELECT","TEXTAREA"].includes(el.tagName));
    const viewportOverflow = Math.max(0, document.documentElement.scrollWidth - innerWidth);
    const verticalOverflow = Math.max(0, document.documentElement.scrollHeight - innerHeight);

    const offscreen = all.filter(el => {
      const r = el.getBoundingClientRect();
      if (r.width > innerWidth * 2 || r.height > innerHeight * 3) return false;
      if (hasScrollAncestor(el, "x")) return false;
      return r.left < -4 || r.right > innerWidth + 4;
    }).slice(0, 25).map(el => ({ tag: el.tagName, cls: String(el.className || "").slice(0,120), text: txt(el).slice(0,80), rect: (() => { const r=el.getBoundingClientRect(); return [Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom)]; })() }));

    const clippedText = textEls.filter(el => {
      if (["INPUT","TEXTAREA","SELECT","OPTION"].includes(el.tagName)) return false;
      const s = getComputedStyle(el);
      const clipped = el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2;
      const hides = ["hidden", "clip"].includes(s.overflow) || ["hidden", "clip"].includes(s.overflowX) || ["hidden", "clip"].includes(s.overflowY);
      if (!clipped || !hides) return false;
      if (s.textOverflow === "ellipsis" && (el.getAttribute("title") || el.getAttribute("aria-label"))) return false;
      return true;
    }).slice(0, 30).map(el => ({ tag: el.tagName, cls: String(el.className || "").slice(0,100), text: txt(el).slice(0,100), client: [el.clientWidth,el.clientHeight], scroll: [el.scrollWidth,el.scrollHeight] }));

    const buttonTextOverflow = controls.filter(el => {
      if (!txt(el)) return false;
      return el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2;
    }).slice(0,20).map(el => ({ tag: el.tagName, text: txt(el).slice(0,100), client: [el.clientWidth,el.clientHeight], scroll:[el.scrollWidth,el.scrollHeight] }));

    const tinyText = textEls.filter(el => {
      if (["CODE","PRE","SUP","SUB"].includes(el.tagName)) return false;
      const ownText = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim().length > 0);
      if (!ownText) return false;
      return parseFloat(getComputedStyle(el).fontSize) < 11;
    }).slice(0,30).map(el => ({ tag: el.tagName, size: getComputedStyle(el).fontSize, text: txt(el).slice(0,100), cls:String(el.className||"").slice(0,100) }));

    const tightLineHeight = textEls.filter(el => {
      const t = txt(el); if (t.length < 30) return false;
      const s = getComputedStyle(el), fs = parseFloat(s.fontSize), lh = parseFloat(s.lineHeight);
      return Number.isFinite(fs) && Number.isFinite(lh) && lh / fs < 1.08;
    }).slice(0,20).map(el => ({ tag:el.tagName, fontSize:getComputedStyle(el).fontSize, lineHeight:getComputedStyle(el).lineHeight, text:txt(el).slice(0,100) }));

    const familyCounts = {};
    for (const el of textEls) {
      const family = getComputedStyle(el).fontFamily || "unknown";
      familyCounts[family] = (familyCounts[family] || 0) + 1;
    }

    const unlabeled = all.filter(el => ["INPUT","SELECT","TEXTAREA"].includes(el.tagName)).filter(el => {
      if (el instanceof HTMLInputElement && el.type === "hidden") return false;
      const id = el.id; const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      return !explicit && !el.closest("label") && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && !el.getAttribute("title");
    }).slice(0,20).map(el => ({ tag:el.tagName,type:el.getAttribute("type"),name:el.getAttribute("name"),placeholder:el.getAttribute("placeholder") }));

    const offscreenOverlays = all.filter(el => {
      const s = getComputedStyle(el); if (!["fixed","absolute"].includes(s.position)) return false;
      if (!(el.matches('[role="dialog"],dialog,[role="menu"],[role="listbox"],.modal,.popover,.dropdown') || el.closest('[role="dialog"],dialog,.modal'))) return false;
      const r = el.getBoundingClientRect(); return r.left < -4 || r.top < -4 || r.right > innerWidth + 4 || r.bottom > innerHeight + 4;
    }).slice(0,20).map(el => ({ tag:el.tagName,cls:String(el.className||"").slice(0,100),text:txt(el).slice(0,80) }));

    const tablesWithoutScroll = [...document.querySelectorAll("table")].filter(visible).filter(t => t.scrollWidth > innerWidth && !hasScrollAncestor(t,"x"))
      .slice(0,10).map(t => ({ width:t.scrollWidth, cls:String(t.className||"").slice(0,100) }));

    const smallTargets = controls.filter(el => {
      if (el instanceof HTMLInputElement && el.type === "hidden") return false;
      const r=el.getBoundingClientRect(); return r.width < 24 || r.height < 24;
    }).slice(0,30).map(el => ({ tag:el.tagName,text:txt(el).slice(0,70),w:Math.round(el.getBoundingClientRect().width),h:Math.round(el.getBoundingClientRect().height) }));

    const duplicateIds = (() => { const ids=[...document.querySelectorAll("[id]")].map(el=>el.id).filter(Boolean); return [...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))].slice(0,20); })();
    const brokenImages = [...document.images].filter(visible).filter(img => img.complete && img.naturalWidth === 0).map(img => img.src || img.alt).slice(0,20);
    const activeNav = document.querySelector("nav button.active")?.getAttribute("aria-label") || "";

    return { viewportOverflow, verticalOverflow, offscreen, clippedText, buttonTextOverflow, tinyText, tightLineHeight,
      familyCounts, unlabeled, offscreenOverlays, tablesWithoutScroll, smallTargets, duplicateIds, brokenImages, activeNav };
  });
}

function findingsFromProbe(area, p) {
  if (p.viewportOverflow > 4) addFinding("high", area, "Page-level horizontal overflow", `${p.viewportOverflow}px`);
  if (p.offscreen.length) addFinding("medium", area, "Visible elements extend outside viewport without scroll container", `${p.offscreen.length} samples`, JSON.stringify(p.offscreen));
  if (p.clippedText.length) addFinding("medium", area, "Visible text is clipped/truncated without accessible fallback", `${p.clippedText.length} samples`, JSON.stringify(p.clippedText));
  if (p.buttonTextOverflow.length) addFinding("high", area, "Button/control text overflow", `${p.buttonTextOverflow.length} samples`, JSON.stringify(p.buttonTextOverflow));
  if (p.tinyText.length) addFinding("medium", area, "Rendered text below 11px", `${p.tinyText.length} samples`, JSON.stringify(p.tinyText));
  if (p.tightLineHeight.length) addFinding("low", area, "Very tight line-height on long text", `${p.tightLineHeight.length} samples`, JSON.stringify(p.tightLineHeight));
  if (p.unlabeled.length) addFinding("medium", area, "Unlabelled visible form controls", `${p.unlabeled.length} samples`, JSON.stringify(p.unlabeled));
  if (p.offscreenOverlays.length) addFinding("high", area, "Modal/menu/popover extends outside viewport", `${p.offscreenOverlays.length} samples`, JSON.stringify(p.offscreenOverlays));
  if (p.tablesWithoutScroll.length) addFinding("high", area, "Wide table without scroll containment", JSON.stringify(p.tablesWithoutScroll));
  if (p.smallTargets.length) addFinding("low", area, "Interaction targets below 24px", `${p.smallTargets.length} samples`, JSON.stringify(p.smallTargets));
  if (p.duplicateIds.length) addFinding("high", area, "Duplicate DOM IDs", p.duplicateIds.join(", "));
  if (p.brokenImages.length) addFinding("high", area, "Broken visible images", p.brokenImages.join(", "));
}

async function auditMatrix(browser, cfg) {
  const context = await browser.newContext({ viewport: { width:cfg.width, height:cfg.height }, colorScheme: cfg.theme });
  await wireAccess(context); await login(context);
  const page = await context.newPage(); observe(page);
  await page.goto(baseUrl, { waitUntil:"networkidle", timeout:60_000 }); await page.waitForTimeout(900);
  if (cfg.theme === "dark") {
    const toggle = page.getByRole("button", { name:"Koyu temaya geç", exact:true });
    if (await toggle.count()) { await toggle.evaluate(el => el.click()); await page.waitForTimeout(350); }
  }
  const matrix = { ...cfg, modules: [] };
  for (let i=0;i<moduleLabels.length;i++) {
    const label=moduleLabels[i], area=`${cfg.name}:${label}`;
    const nav=page.locator(`nav button[aria-label=${JSON.stringify(label)}]`).first();
    if (!(await nav.count())) { addFinding("high",area,"Navigation item missing",label); matrix.modules.push({label,status:"missing"}); continue; }
    try {
      await nav.evaluate(el => el.click()); await page.waitForTimeout(420);
      const probe=await deepDomProbe(page); findingsFromProbe(area,probe);
      if (probe.activeNav && probe.activeNav !== label && !["AI Yönetişimi","Ask Fornost"].includes(label)) addFinding("medium",area,"Active navigation mismatch",`expected=${label}; active=${probe.activeNav}`);
      const filename=`${cfg.name}-${String(i+1).padStart(2,"0")}-${slug(label)}.png`;
      await page.screenshot({ path:path.join(screenshotsDir,filename), fullPage:false, animations:"disabled" });
      matrix.modules.push({label,status:"ok",screenshot:`screenshots/${filename}`,probe});
    } catch (e) { addFinding("high",area,"Module UI audit failed",e.message); matrix.modules.push({label,status:"error",error:e.message}); }
  }
  report.matrices.push(matrix); await context.close();
}

async function probeApiRoutes(browser, routes) {
  const context = await browser.newContext(); await wireAccess(context); await login(context);
  for (const route of routes.filter(r => r.methods.includes("GET"))) {
    const url = `${baseUrl}${route.urlPath}`;
    try {
      const r = await context.request.get(url, { headers:{...accessHeaders(), origin:baseUrl}, timeout:20_000 });
      const item={path:route.urlPath,status:r.status(),file:route.file}; report.api.push(item);
      if (r.status() >= 500) addFinding("high","backend-api","GET endpoint returned 5xx",`${route.urlPath} -> ${r.status()}`,route.file);
      else if (r.status() === 404) addFinding("medium","backend-api","GET route source exists but endpoint returned 404",route.urlPath,route.file);
    } catch (e) { report.api.push({path:route.urlPath,status:"error",error:e.message,file:route.file}); addFinding("high","backend-api","GET endpoint request failed",`${route.urlPath}: ${e.message}`,route.file); }
  }
  await context.close();
}

const routes = await sourceAudit();
const browser = await chromium.launch({ headless:true });
try {
  for (const cfg of matrices) await auditMatrix(browser,cfg);
  await probeApiRoutes(browser,routes);
} finally { await browser.close(); }

if (report.consoleErrors.length) addFinding("high","runtime","Console errors detected",`${report.consoleErrors.length} unique`,JSON.stringify(report.consoleErrors.slice(0,20)));
if (report.pageErrors.length) addFinding("high","runtime","Unhandled page errors detected",`${report.pageErrors.length} unique`,JSON.stringify(report.pageErrors.slice(0,20)));
const ownFailures=report.failedRequests.filter(x => { try{return new URL(x.url).origin===prodOrigin;}catch{return false;} });
if (ownFailures.length) addFinding("high","network","First-party failed requests detected",`${ownFailures.length} unique`,JSON.stringify(ownFailures.slice(0,20)));
const ownHttp=report.httpErrors.filter(x => { try{return new URL(x.url).origin===prodOrigin;}catch{return false;} });
const own5xx=ownHttp.filter(x=>x.status>=500);
if (own5xx.length) addFinding("high","network","First-party HTTP 5xx responses detected",`${own5xx.length} unique`,JSON.stringify(own5xx.slice(0,20)));

report.finishedAt = new Date().toISOString();
report.summary = {
  matrices: report.matrices.length,
  moduleViewsAudited: report.matrices.reduce((n,m)=>n+m.modules.filter(x=>x.status==="ok").length,0),
  expectedModuleViews: matrices.length * moduleLabels.length,
  apiGetRoutesProbed: report.api.length,
  consoleErrors:report.consoleErrors.length, pageErrors:report.pageErrors.length,
  firstPartyFailedRequests:ownFailures.length, firstParty5xx:own5xx.length,
  findings:report.findings.length,
  findingsBySeverity:report.findings.reduce((a,f)=>(a[f.severity]=(a[f.severity]||0)+1,a),{}),
};

await fs.writeFile(path.join(outDir,"product-full-qa.json"),JSON.stringify(report,null,2));
const esc=s=>String(s??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[c]));
const rows=report.findings.map(f=>`<tr><td>${esc(f.severity)}</td><td>${esc(f.area)}</td><td>${esc(f.title)}</td><td>${esc(f.detail)}</td></tr>`).join("");
const html=`<!doctype html><html><head><meta charset="utf-8"><title>Fornost Full Product QA</title><style>body{font-family:system-ui,sans-serif;margin:28px;color:#17202a}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d8dee5;padding:8px;vertical-align:top}th{background:#f5f7fa}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:18px 0}.card{border:1px solid #d8dee5;border-radius:10px;padding:12px}.card b{display:block;font-size:24px}</style></head><body><h1>Fornost Full Product QA</h1><p>Target: <b>${esc(baseUrl)}</b><br>Started: ${esc(report.startedAt)}<br>Finished: ${esc(report.finishedAt)}</p><div class="cards"><div class="card">UI module views<b>${report.summary.moduleViewsAudited}/${report.summary.expectedModuleViews}</b></div><div class="card">GET API probes<b>${report.summary.apiGetRoutesProbed}</b></div><div class="card">Findings<b>${report.summary.findings}</b></div><div class="card">First-party 5xx<b>${report.summary.firstParty5xx}</b></div></div><h2>Source inventory</h2><pre>${esc(JSON.stringify({fileCount:report.source.fileCount,cssFiles:report.source.cssFiles,codeFiles:report.source.codeFiles,apiRouteFiles:report.source.apiRouteFiles,tests:report.source.tests,fontFamilies:report.source.fontFamilies},null,2))}</pre><h2>Findings</h2><table><thead><tr><th>Severity</th><th>Area</th><th>Finding</th><th>Detail</th></tr></thead><tbody>${rows||"<tr><td colspan=4>No findings</td></tr>"}</tbody></table></body></html>`;
await fs.writeFile(path.join(outDir,"product-full-qa.html"),html);
console.log("PRODUCT_FULL_QA_SUMMARY",JSON.stringify(report.summary));
console.log(`PRODUCT_FULL_QA_FINDINGS ${report.findings.length}`);
for (const f of report.findings.slice(0,80)) console.log(`${f.severity.toUpperCase()} [${f.area}] ${f.title} — ${f.detail}`);
