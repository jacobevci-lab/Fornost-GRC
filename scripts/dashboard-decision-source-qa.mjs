import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { qaPassword } from "./qa-credentials.mjs";

const base = "http://127.0.0.1:4173";
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
try {
  const context = await browser.newContext();
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
  await page.route("**/api/grc", route => registerAvailable
    ? route.fulfill({ json: { rows: records, nextCursor: null } })
    : route.fulfill({ status: 503, json: { error: "QA source unavailable" } }));
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
    record("rsk-024", "Risk Assessment", "Ayrıcalıklı hesaplarda erişim denetimi", { likelihood: 5, impact: 5, owner: "Bilgi Güvenliği" }),
    record("aud-008", "Denetim Yönetimi", "Yedekten dönüş tatbikatının gözden geçirilmesi", { dueDate: "2025-10-12", owner: "İç Denetim" }),
    record("rsk-016", "Risk Assessment", "Kritik tedarikçide hizmet sürekliliği", { likelihood: 3, impact: 4, owner: "Tedarik Yönetimi" }),
    record("cmp-011", "Uyum", "Erişim haklarının dönemsel gözden geçirilmesi", { status: "Kısmi", owner: "Bilgi Teknolojileri" }),
    record("cmp-017", "Uyum", "Değişiklik kayıtlarında onay kanıtı", { status: "Kısmi", owner: "Altyapı" }),
  ];
  escalationStatus = 200;
  findingBody = { count: 2 };
  await page.reload();
  const queue = dashboard.locator(".decision-queue");
  const rows = queue.locator(".decision-record");
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toHaveAttribute("data-record-id", "rsk-024");
  await expect(rows.nth(1)).toHaveAttribute("data-record-id", "aud-008");
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
  const out = "dashboard-design-preview";
  await mkdir(out, { recursive: true });
  for (const [theme, width] of [["light", 1440], ["dark", 390]]) {
    await page.setViewportSize({ width, height: 960 });
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.locator(".theme-toggle:visible").click();
    const workspace = dashboard.locator(".executive-action-workspace");
    await expect(workspace).toBeVisible();
    assert.ok(await workspace.evaluate(el => el.getBoundingClientRect().top < el.parentElement.querySelector(".executive-dashboard-kpis").getBoundingClientRect().top));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 4));
    const fontSize = locator => locator.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    assert.ok(await fontSize(queue.getByRole("heading")) >= 18);
    assert.ok(await fontSize(rows.first().locator(".decision-record-body > strong")) >= 15);
    assert.ok(await fontSize(attention.locator(".decision-signal-total strong")) >= 30);
    await workspace.screenshot({ path: `${out}/karar-masasi-${width}.png` });
  }
  console.log("Dashboard source QA passed: authenticated counts, register retry, independent failures, partial counts, verified zero and failed refresh.");
} finally {
  await browser.close();
}
