import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import {openOverallAuditReadiness,  createQaContext, openQaModule } from "./qa-browser-harness.mjs";
import { qaPassword } from "./qa-credentials.mjs";

const base = "http://127.0.0.1:4173";
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
try {
  const context = await createQaContext(browser, base, {});
  const page = await context.newPage();
  const paths = ["/api/findings", "/api/continuous-assurance/executive"];
  for (const path of paths) {
    assert.equal((await context.request.get(base + path + "?view=dashboard-count")).status(), 401);
  }
  const login = await context.request.post(base + "/api/auth", {
    headers: { origin: base }, data: { action: "login", email: "qa-admin@fornost.test", password: qaPassword() },
  });
  assert.equal(login.status(), 200);
  for (const path of paths) {
    const response = await context.request.get(base + path + "?view=dashboard-count");
    assert.equal(response.status(), 200);
    const data = await response.json();
    assert.deepEqual(Object.keys(data), ["count"]);
    assert.ok(Number.isSafeInteger(data.count) && data.count >= 0);
  }

  let registerAvailable = false;
  let records = [];
  let findingBody = { count: 4 };
  let escalationStatus = 503;
  let pendingRecordRead;
  await page.route("**/api/grc", async route => {
    await pendingRecordRead;
    return registerAvailable
      ? route.fulfill({ json: { rows: records, nextCursor: null } })
      : route.fulfill({ status: 503, json: { error: "QA source unavailable" } });
  });
  await page.route("**/api/findings?view=dashboard-count", route => route.fulfill({ json: findingBody }));
  await page.route("**/api/continuous-assurance/executive?view=dashboard-count",
    route => route.fulfill({ status: escalationStatus, json: { count: 0 } }));
  await page.goto(base);
  const failure = page.getByRole("status").filter({ has: page.getByRole("heading", { name: "GRC kayıtları yüklenemedi" }) });
  await expect(failure).toBeVisible();
  const dashboard = page.locator(".executive-dashboard-reference");
  await expect(dashboard).toHaveCount(0);
  registerAvailable = true;
  await failure.getByRole("button", { name: "Yeniden dene" }).click();
  const reportDetails=dashboard.locator(".report-details");
  await expect(reportDetails.locator(":scope>summary")).toBeVisible();
  await expect(dashboard.locator(".decision-queue")).toBeHidden();
  await reportDetails.locator(":scope>summary").click();
  const attention = dashboard.locator(".executive-attention-band");
  const decisions = dashboard.locator(".executive-decision-board");
  const warning = dashboard.locator(".executive-data-warning");
  await expect(attention).toContainText("En az 4 yönetim sinyali");
  await expect(warning).toContainText("Güvence eskalasyonları");
  await expect(attention.getByRole("button", { name: /Açık bulgu/ })).toContainText("4");

  await page.locator(".language-switch:visible").getByRole("button", { name: "EN", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  escalationStatus = 200;
  findingBody = { count: "0" };
  await warning.getByRole("button", { name: "Retry" }).click();
  await expect(warning).toContainText("Open findings");
  await expect(attention).toContainText("Management signal total is unconfirmed");
  await expect(decisions).not.toContainText("No priority decisions pending");
  await expect(attention.getByRole("button", { name: /Open findings/ })).toContainText("—");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 4));

  findingBody = { count: 0 };
  await warning.getByRole("button", { name: "Retry" }).click();
  await expect(attention).toContainText("No critical management signals");
  await expect(attention.getByRole("button", { name: /Open findings/ })).toContainText("0");
  await expect(warning).toHaveCount(0);
  escalationStatus = 503;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(warning).toContainText("Assurance escalations");
  await expect(attention).not.toContainText("No critical management signals");
  function record(id, module, title, data) {
    return { id, module, record_code: id.toUpperCase(), data_json: JSON.stringify({ title, ...data }) };
  }
  records = [
    record("rsk-024", "Risk Assessment", "Ayrıcalıklı hesaplarda erişim denetimi", { likelihood: 5, impact: 5, owner: "Bilgi Güvenliği", existingControls: "CTL-014" }),
    record("ctl-014", "Kontroller", "Erişim kontrolü", { controlRef: "CTL-014" }),
    record("evd-014", "Kanıtlar", "Erişim gözden geçirmesi", { controlRef: "CTL-014", expiresAt: "2024-01-01" }),
    record("aud-008", "Denetim Yönetimi", "Yedekten dönüş tatbikatının gözden geçirilmesi", { dueDate: "2025-10-12", owner: "İç Denetim" }),
    record("rsk-016", "Risk Assessment", "Kritik tedarikçide hizmet sürekliliği", { likelihood: 3, impact: 4, owner: "Tedarik Yönetimi" }),
    record("cmp-011", "Uyum", "Erişim haklarının dönemsel gözden geçirilmesi", { status: "Kısmi", owner: "Bilgi Teknolojileri" }),
    record("cmp-017", "Uyum", "Değişiklik kayıtlarında onay kanıtı", { status: "Kısmi", owner: "Altyapı" }),
  ];
  const sampleRecords = records;
  records = [
    ...sampleRecords, record("rsk-025","Risk Assessment","İkinci kritik risk",{likelihood:5,impact:5,owner:"Kimlik Ekibi"}),
    record("rsk-026","Risk Assessment","Değerlendirme bekliyor",{}),
  ];
  const iso = "ISO/IEC 27001:2022", soc = "SOC 2";
  const overview = {catalog:[iso,soc],enrolled:[iso,soc],controlFrameworkCounts:{},comparison:{},
    coverage:{[iso]:{scope:4,compliant:1,assessed:2,evidenced:1},[soc]:{scope:2,compliant:2,assessed:2,evidenced:2}}};
  await page.route("**/api/framework-posture?overview=1",route=>route.fulfill({json:overview}));
  await page.reload();
  const kpis = dashboard.locator(".executive-kpi");
  await expect(kpis).toHaveCount(6);
  await expect(kpis.filter({hasText:"High & Critical Risk"})).toContainText("3 / 3");
  await expect(kpis.filter({hasText:"High & Critical Risk"})).toHaveClass(/risk-critical/);
  await expect(kpis.filter({hasText:"Compliance Health"})).toContainText("50%");
  await expect(dashboard.locator(".compliance-portfolio-panel")).toContainText("2 active frameworks");
  await expect(dashboard.locator(".portfolio-warning")).toContainText(iso);
  await dashboard.locator(".report-cells button").filter({hasText:"2"}).click();
  const preview=dashboard.locator(".risk-cell-preview li");
  await expect(preview).toHaveCount(2);
  await preview.filter({hasText:"RSK-025"}).getByRole("button").click();
  await expect(page.locator(".record-workspace")).toContainText("İkinci kritik risk");
  await openQaModule(page,"Dashboard");
  await kpis.filter({hasText:"High & Critical Risk"}).click();
  await expect(page.locator(".risk-register")).toContainText("RSK-025");
  await expect(page.locator(".risk-register")).not.toContainText("RSK-026");
  await openQaModule(page,"Dashboard");
  await kpis.filter({hasText:"Chain Coverage"}).click();
  await expect(page.locator(".cgw-gaps")).toBeVisible();
  await expect(page.locator(".cgw-gaps select").filter({has:page.locator('option[value="gap"]')})).toHaveValue("gap");
  await openQaModule(page,"Dashboard");
  await kpis.filter({hasText:"Control Assurance"}).click();
  await expect(page.locator(".dashboard-lens")).toContainText("Controls needing attention");
  await openQaModule(page,"Dashboard");
  await kpis.filter({hasText:"Audit Readiness"}).click();
  await expect(page.locator(".audit-readiness-gaps")).toHaveAttribute("open","");
  await openQaModule(page,"Dashboard");
  await kpis.filter({hasText:"Compliance Health"}).click();
  await expect(page.locator(".posture-column-head[aria-pressed=true]")).toHaveAttribute("title",new RegExp(iso));
  await openQaModule(page,"Dashboard");
  await page.unroute("**/api/framework-posture?overview=1");
  records = sampleRecords;
  const chainTime = new Date().toISOString();
  await page.route("**/api/executive-assurance", route => route.fulfill({json: {
    generatedAt: chainTime, verified: true, issues: [],
    rows: [{id:"evd-014", module:"Kanıtlar", data:{title:"Erişim gözden geçirmesi", controlRef:"CTL-014", expiresAt:"2024-01-01", evidenceIntegrity:"verified"}}],
    auditPortfolio:{audits:[], verified:true, issues:[], orphanRequirements:0, generatedAt:chainTime}
  }}));
  escalationStatus = 200;
  findingBody = { count: 2 };
  await page.reload();
  await expect(dashboard.locator(".report-cells [data-band]")).toHaveCount(25);
  await expect(dashboard.locator(".report-cells button")).toHaveCount(2);
  await dashboard.locator(".report-cells button").first().click();
  await expect(dashboard.locator(".risk-cell-preview li")).toHaveCount(1);
  await dashboard.getByRole("button", {name:"Evidence Renewals", exact:true}).click();
  await expect(dashboard.locator(".priority-list li")).toHaveCount(1);
  await expect(dashboard.locator(".priority-list li")).toContainText("EVD-014");
  await reportDetails.locator(":scope>summary").click();
  const queue = dashboard.locator(".decision-queue");
  const rows = queue.locator(".decision-record");
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toHaveAttribute("data-record-id", "rsk-024");
  await expect(rows.nth(1)).toHaveAttribute("data-record-id", "aud-008");
  await expect(rows.nth(1).locator(".decision-reason")).toHaveText("Overdue audit requirement");
  await queue.getByRole("button", { name: "Show more", exact: true }).click();
  await expect(rows).toHaveCount(5);
  await queue.getByRole("button", { name: "Show less", exact: true }).click();
  await queue.getByRole("button", { name: "Risk", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await rows.nth(1).focus();
  await page.keyboard.press("Enter");
  const focus = page.locator(".core-record-focus");
  await expect(focus).toContainText("RSK-016");
  await focus.getByRole("button", { name: "Return to previous view", exact: true }).click();
  await expect(queue.getByRole("button", { name: "Risk", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(queue.locator('[data-record-id="rsk-016"]')).toBeFocused();
  await queue.getByRole("button", { name: "All", exact: true }).click();
  await page.locator(".language-switch:visible").getByRole("button", { name: "TR", exact: true }).click();
  await expect(attention).toContainText("4 yönetim sinyali");
  await expect(rows.nth(1).locator(".decision-reason")).toHaveText("Geciken denetim maddesi");
  const out = "dashboard-design-preview";
  await mkdir(out, { recursive: true });
  for (const [theme, width] of [["light", 1440], ["dark", 390]]) {
    await page.setViewportSize({ width, height: 960 });
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.locator(".theme-toggle:visible").click();
    await expect(dashboard.locator(".chain-board, .assurance-chain, .module-trail-panel")).toHaveCount(0);
    const workspace = dashboard.locator(".executive-action-workspace");
    await expect(workspace).toBeVisible();
    await reportDetails.locator(":scope>summary").click();
    await expect(workspace).toBeHidden();
    await expect(dashboard.locator(".report-chart-grid")).toBeVisible();
    await dashboard.locator(".executive-dashboard-header").scrollIntoViewIfNeeded();
    const typography = await dashboard.evaluate(root => {
      const visible = selector => [...root.querySelectorAll(selector)].filter(el => el.checkVisibility());
      const size = selector => visible(selector).map(el => parseFloat(getComputedStyle(el).fontSize));
      const roleText = visible(".executive-dashboard-header h2,.report-chart h3,.domain-link,.executive-kpi>strong");
      return {
        sameFamily: roleText.every(el => getComputedStyle(el).fontFamily === getComputedStyle(document.body).fontFamily),
        title: size(".executive-dashboard-header h2"),
        panels: size(".report-chart h3,.domain-link"),
        metrics: size(".executive-kpi>strong"),
      };
    });
    assert.deepEqual(typography, {sameFamily:true,title:[13],panels:Array(6).fill(13),metrics:Array(6).fill(17)}, JSON.stringify({width,theme,typography}));
    await dashboard.screenshot({ path: `${out}/executive-period-report-${width}.png` });
    await reportDetails.locator(":scope>summary").click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 4));
    const fontSize = locator => locator.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    assert.equal(await fontSize(queue.getByRole("heading")), 13);
    assert.equal(await fontSize(attention.getByRole("heading")), 13);
    assert.ok(await fontSize(rows.first().locator(".decision-record-body > strong")) === 12);
    assert.ok(await fontSize(attention.locator(".decision-signal-total strong")) === 17);
    await workspace.screenshot({ path: `${out}/karar-masasi-${width}.png` });
  }
  await page.route("**/api/executive-assurance",route=>route.fulfill({json:{
    generatedAt:chainTime,verified:true,issues:[],rows:[{id:"evd-014",module:"Kanıtlar",data:{evidenceIntegrity:"verified"}}],
    auditPortfolio:{audits:[],verified:true,issues:[],orphanRequirements:0,generatedAt:chainTime}
  }}));
  await page.reload();
  await dashboard.getByRole("button",{name:/Kanıt Güncelliği/}).click();
  await expect(page.locator(".dashboard-lens")).toContainText("Güncelliği doğrulanmayan kanıtlar");
  await openQaModule(page,"Gösterge Paneli");
  const generatedAt = new Date().toISOString();
  const audit = { id: "qa-linked", name: "QA Portfolio", gate: "empty", verified: true, issues: [], requirements: 0, current: 0, blockers: 0 };
  await page.route("**/api/executive-assurance", route => route.fulfill({ json: {
    rows: [], verified: false, issues: ["orphan-requirements"], generatedAt,
    auditPortfolio: { audits: [audit], verified: false, issues: ["orphan-requirements"], orphanRequirements: 1, generatedAt },
  } }));
  await page.route("**/api/audits", route => route.fulfill({ json: { audits: [audit] } }));
  const requirement = (id, data) => record(id, "Denetim Yönetimi", "Aynı başlık", { requirementTitle: "Aynı başlık", requirementRef: id.toUpperCase(), ...data });
  records = [
    requirement("aud-linked", { auditName: audit.name, owner: "A ekibi", targetDate: "2024-01-01" }),
    requirement("aud-unlinked", { owner: "B ekibi", dueDate: "2024-01-02" }),
    requirement("aud-closed", { auditName: audit.name, dueDate: "2024-01-01", status: "Completed" }),
    requirement("aud-today", { auditName: audit.name, dueDate: generatedAt.slice(0, 10) }),
  ];
  await page.reload();
  await expect(queue).toBeHidden();
  const overdueRows = dashboard.locator(".priority-list li").filter({hasText:"Geciken denetim maddesi"});
  await expect(overdueRows).toHaveCount(2);
  for (const id of ["aud-unlinked", "aud-linked"]) {
    await overdueRows.filter({hasText:id.toUpperCase()}).getByRole("button").press("Enter");
    await expect(focus).toContainText(id.toUpperCase());
    const desk = page.getByRole("region", { name: "Madde çalışma alanı", exact: true });
    await expect(desk.locator("header small")).toHaveText(id.toUpperCase());
    await expect(desk.locator("dd").filter({hasText:id==="aud-linked"?"A ekibi":"B ekibi"})).toBeVisible();
    await focus.getByRole("button",{name:"Önceki görünüme dön"}).click();
    await expect(overdueRows).toHaveCount(2);
  }
  await dashboard.locator(".priority-actions").screenshot({path:out+"/geciken-denetim-maddeleri.png"});
  await page.setViewportSize({ width: 1536, height: 960 });
  await openQaModule(page, "Denetim Yönetimi");
  await expect(page.getByRole("heading", { name: "Denetim Portföyü", exact: true })).toBeVisible();
  await openOverallAuditReadiness(page);
  const portfolioCount = page.locator(".audit-kpis article").filter({ hasText: "Portföye bağlı geciken maddeler" });
  await expect(portfolioCount.locator("b")).toHaveText("1");
  await page.locator(".apw-select").filter({hasText:audit.name}).click();
  await expect(page.locator(".apw-inspector .apw-status").filter({hasText:"Gecikti"})).toHaveCount(1);
  await openQaModule(page, "Gösterge Paneli");
  const actionGroup = dashboard.locator(".dashboard-action-group");
  const actions = actionGroup.getByRole("button", { name: "İşlemler", exact: true });
  const customize = actionGroup.getByRole("button", { name: "Özelleştir", exact: true });
  await expect(actions).toBeHidden();
  await expect(customize).toBeVisible();
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(actions).toBeVisible();
    await expect(customize).toBeHidden();
    await actions.press("Enter");
    await expect(actions).toHaveAttribute("aria-expanded", "true");
    await expect(actionGroup.getByRole("button", { name: "Denetçi Paketi", exact: true })).toBeVisible();
    await expect(actionGroup.getByRole("button", { name: "Yönetim Raporu", exact: true })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await customize.press("Escape");
    await expect(actions).toBeFocused();
    await expect(customize).toBeHidden();
  }
  await actions.click();
  await dashboard.getByRole("heading", { name: "Yönetici özeti", exact: true }).click();
  await expect(actions).toHaveAttribute("aria-expanded", "false");
  await actions.click();
  await actionGroup.getByRole("button", { name: "Yönetim Raporu", exact: true }).click();
  await expect(page.locator("main > header h1")).toHaveText("Raporlama");
  await openQaModule(page, "Gösterge Paneli");
  await expect(actions).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: `${out}/mobile-dashboard-actions.png` });

  await openQaModule(page, "Benim İşlerim");
  const inbox = page.locator(".my-work-v2");
  const emptyTitle = inbox.getByRole("heading", { name: "Şu an üzerinize atanmış açık görev bulunmuyor", exact: true });
  const refresh = inbox.getByRole("button", { name: "Yenile", exact: true });
  await emptyTitle.scrollIntoViewIfNeeded();
  await expect(emptyTitle).toBeInViewport();
  await page.screenshot({ path: `${out}/mobile-personal-inbox.png` });
  await inbox.getByRole("button", { name: "Organizasyon", exact: true }).click();
  await expect(emptyTitle).toHaveCount(0);
  await inbox.getByRole("button", { name: "Benim", exact: true }).click();
  await expect(emptyTitle).toBeVisible();
  let resume;
  pendingRecordRead = new Promise(resolve => { resume = resolve; });
  await refresh.click();
  await expect(emptyTitle).toHaveCount(0);
  registerAvailable = false;
  pendingRecordRead = undefined;
  resume();
  await expect(inbox.getByRole("alert")).toBeVisible();
  await expect(emptyTitle).toHaveCount(0);
  registerAvailable = true;
  records = [record("rsk-inbox", "Risk Assessment", "QA kişisel iş", { owner: "qa-admin@fornost.test", status: "Açık" })];
  await refresh.click();
  await expect(inbox.locator(".mw2-meta b").first()).toHaveText("1");
  await expect(emptyTitle).toHaveCount(0);
  await inbox.locator(".mw2-toolbar input").fill("eşleşmeyen kayıt");
  await expect(inbox.locator(".mw2-empty")).toBeVisible();
  await expect(emptyTitle).toHaveCount(0);
  records = [];
  await inbox.locator(".mw2-toolbar input").fill("");
  await refresh.click();
  await expect(emptyTitle).toBeVisible();
  records = [
    record("aud-trail", "Denetim Yönetimi", "Erişim yetkilerinin incelenmesi", {requirementRef:"CTL-014"}),
    record("ctl-014", "Kontroller", "Ayrıcalıklı erişim kontrolü", {controlRef:"CTL-014"}),
    record("evd-014", "Kanıtlar", "Erişim gözden geçirme tutanağı", {controlRef:"CTL-014"}),
    record("evd-015", "Kanıtlar", "Yetki onay kaydı", {controlRef:"CTL-014"}),
    record("ast-trail","Varlık Envanteri","Kimlik platformu",{}),
    record("rsk-trail","Risk Assessment","Yetkisiz erişim",{asset:"AST-TRAIL",existingControls:"CTL-014"}),
  ];
  records.push(record("bia-trail","BIA","Kimlik hizmeti",{process:"Kimlik hizmeti",asset:"AST-TRAIL"}));
  await page.route("**/api/continuity",route=>route.fulfill({json:{plans:[{id:"plan-trail",code:"BCP-TRAIL",name:"Kimlik kurtarma planı",biaRef:"BIA-TRAIL",status:"draft",owner:"qa-admin@fornost.test",reviewer:"reviewer@fornost.test",crisisLead:"crisis@fornost.test",createdBy:"qa-admin@fornost.test",rtoHours:4,rpoHours:1,mtpdHours:8}],exercises:[],gaps:[]}}));
  await page.route("**/api/continuity?view=dossier&planId=plan-trail*",route=>route.fulfill({json:{latest:null,gaps:[],hasMore:false}}));
  await page.reload();
  await openQaModule(page,"Risk Değerlendirmesi");
  await page.locator(".risk-register .record-open").first().click();
  const inspector=page.locator(".record-inspector"), business=inspector.locator(".business-context");
  await expect(business.locator('[data-context-stage="asset"]')).toContainText("Kimlik platformu");
  await expect(business.locator('[data-context-stage="plan"]')).toContainText("Kimlik kurtarma planı");
  await expect(business.locator('[data-context-stage="plan"] .context-via')).toHaveText(/Kimlik platformu.*Kimlik hizmeti/);
  await business.screenshot({path:out+"/asset-risk-bia-plan.png"});
  await business.getByRole("button",{name:/Kimlik kurtarma planı/}).click();
  await expect(page.locator(".cpd-file > header h3")).toHaveText("Kimlik kurtarma planı");
  await expect(page.locator(".cpd-file .cpd-exercise")).toBeVisible();
  await openQaModule(page,"Risk Değerlendirmesi");
  await page.locator(".risk-register .record-open").first().click();
  await expect(inspector.locator(":scope > h3")).toHaveText("Yetkisiz erişim");
  await openQaModule(page,"Denetim Yönetimi");
  const trailPanel=page.locator("main > .module-trail-panel");
  await trailPanel.locator(":scope>summary").click();
  const chain=trailPanel.locator(".module-trail");
  await expect(chain.locator("li")).toHaveCount(3);
  await expect(chain.locator("li").nth(1)).toContainText("Ayrıcalıklı erişim kontrolü");
  await chain.getByRole("combobox",{name:"2. bağlantıyı seç"}).selectOption("evd-015");
  await expect(chain.locator("li").last().locator(".chain-node")).toContainText("Yetki onay kaydı");
  await chain.locator("li").last().getByRole("button").click();
  await expect(chain.locator("li").first()).toContainText("Yetki onay kaydı");
  await trailPanel.getByRole("button",{name:"Önceki kayda dön"}).click();
  await expect(chain.locator("li").first()).toContainText("Erişim yetkilerinin incelenmesi");
  await expect(chain.locator("li").last().locator(".chain-node")).toContainText("Yetki onay kaydı");
  for (const width of [390,1440]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 2));
    await trailPanel.screenshot({path:`${out}/audit-linked-records-${width}.png`});
  }
  await openQaModule(page,"Varlık Envanteri");
  await trailPanel.locator(":scope>summary").click();
  await expect(chain.locator("li").last()).toContainText("Ayrıcalıklı erişim kontrolü");
  await chain.getByRole("button",{name:"Zinciri devam ettir"}).click();
  await expect(chain.locator("li")).toHaveCount(4);
  await trailPanel.screenshot({path:`${out}/asset-linked-records.png`});
  await openQaModule(page,"Tedarikçi Yönetimi");
  await page.route("**/api/third-party-risk",route=>route.fulfill({json:{
    vendors:[{id:"vendor-chain", vendorId:"VEN-001",name:"Bulut hizmet sağlayıcısı"}],assessments:[],findings:[]
  }}));
  await page.route("**/api/findings?view=graph*",route=>route.fulfill({json:{
    revision:"a".repeat(32),complete:true,total:1,nextCursor:null,findings:[{
      id:"fnd-chain",code:"FND-001",title:"Erişim gözden geçirmesi eksik",sourceType:"vendor",sourceRef:"VEN-001",
      correctiveAction:"Yetki listesini doğrula"
    }]
  }}));
  await trailPanel.locator(":scope>summary").click();
  await expect(chain.locator("li").last()).toContainText("Yetki listesini doğrula");
  await trailPanel.screenshot({path:`${out}/vendor-linked-records.png`});
  console.log("Dashboard source QA passed: authenticated counts, register retry, independent failures, partial counts, verified zero and failed refresh.");
} catch (error) {
  await mkdir("dashboard-design-preview",{recursive:true});
  await writeFile("dashboard-design-preview/failure.txt",String(error.stack || error));
  throw error;
} finally {
  await browser.close();
}
