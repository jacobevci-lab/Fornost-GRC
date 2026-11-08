import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createQaContext, openQaModule } from "./qa-browser-harness.mjs";
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
  await expect(dashboard.locator(".audit-remediation-metrics").getByRole("button", { name: /Open findings/ })).toContainText("—");
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
  const chainTime = new Date().toISOString();
  await page.route("**/api/executive-assurance", route => route.fulfill({json: {
    generatedAt: chainTime, verified: true, issues: [],
    rows: [{id:"evd-014", module:"Kanıtlar", data:{title:"Erişim gözden geçirmesi", controlRef:"CTL-014", expiresAt:"2024-01-01", evidenceIntegrity:"verified"}}],
    auditPortfolio:{audits:[], verified:true, issues:[], orphanRequirements:0, generatedAt:chainTime}
  }}));
  escalationStatus = 200;
  findingBody = { count: 2 };
  await page.reload();
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
    assert.ok(await workspace.evaluate(el => el.getBoundingClientRect().top < el.parentElement.querySelector(".executive-dashboard-kpis").getBoundingClientRect().top));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 4));
    const fontSize = locator => locator.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    assert.equal(await fontSize(queue.getByRole("heading")), 18);
    assert.equal(await fontSize(attention.getByRole("heading")), 18);
    assert.ok(await fontSize(rows.first().locator(".decision-record-body > strong")) >= 15);
    assert.ok(await fontSize(attention.locator(".decision-signal-total strong")) >= 30);
    await workspace.screenshot({ path: `${out}/karar-masasi-${width}.png` });
  }
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
  const signal = attention.getByRole("button", { name: /Geciken denetim maddesi/ });
  await expect(signal.locator("strong")).toHaveText("2");
  await signal.click();
  await expect(queue.getByRole("heading", { name: "Geciken denetim maddeleri", exact: true })).toBeFocused();
  await expect(rows).toHaveCount(2);
  assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.recordId)), ["aud-linked", "aud-unlinked"]);
  await expect(rows.first()).toContainText("Portföyde · QA Portfolio");
  await expect(rows.first()).toContainText("A ekibi");
  await expect(rows.nth(1)).toContainText("Portföye bağlı değil");
  await expect(rows.nth(1)).toContainText("B ekibi");
  await expect(rows.nth(1).locator(".decision-date")).toContainText("2024");
  for (const id of ["aud-unlinked", "aud-linked"]) {
    const row = queue.locator(`[data-record-id="${id}"]`);
    let releaseRead;
    if (id === "aud-unlinked") pendingRecordRead = new Promise(resolve => { releaseRead = resolve; });
    await row.press("Enter");
    if (releaseRead) {
      try {
        await expect(focus).toContainText("Kayıt yükleniyor");
        await expect(page.locator(".audit-overview, .audit-readiness-gate")).toHaveCount(0);
      } finally {
        pendingRecordRead = undefined;
        releaseRead();
      }
    }
    await expect(focus).toContainText(id.toUpperCase());
    await expect(page.getByRole("region", { name: "Kayıt tablosu", exact: true }).getByRole("row").filter({ hasText: id === "aud-linked" ? "A ekibi" : "B ekibi" })).toHaveCount(1);
    await focus.getByRole("button", { name: "Önceki görünüme dön" }).click();
    await expect(row).toBeFocused();
    await expect(queue.getByRole("button", { name: "Denetim", exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await queue.screenshot({ path: `${out}/geciken-denetim-maddeleri.png` });
  await page.setViewportSize({ width: 1536, height: 960 });
  await openQaModule(page, "Denetim Yönetimi");
  await expect(page.getByRole("heading", { name: "Denetim Portföyü", exact: true })).toBeVisible();
  const portfolioCount = page.locator(".audit-kpis article").filter({ hasText: "Portföye bağlı geciken maddeler" });
  await expect(portfolioCount.locator("b")).toHaveText("1");
  await expect(page.locator(".audit-card").filter({ hasText: audit.name }).locator("footer strong")).toHaveText("1 geciken");
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
  const emptyTitle = inbox.getByRole("heading", { name: "Kişisel iş kuyruğunda açık işin yok.", exact: true });
  const refresh = inbox.getByRole("button", { name: "Yenile", exact: true });
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
  await page.reload();
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
