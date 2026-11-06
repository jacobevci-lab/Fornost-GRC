import assert from "node:assert/strict";
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
  let findingBody = { count: 4 };
  let escalationStatus = 503;
  await page.route("**/api/grc", route => registerAvailable
    ? route.fulfill({ json: { rows: [], nextCursor: null } })
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
  await expect(decisions).toContainText("En az 4 açık sinyal");

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
  await expect(decisions).toContainText("0 open signals");
  await expect(warning).toHaveCount(0);
  escalationStatus = 503;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(warning).toContainText("Assurance escalations");
  await expect(attention).not.toContainText("No critical management signals");
  console.log("Dashboard source QA passed: authenticated counts, register retry, independent failures, partial counts, verified zero and failed refresh.");
} finally {
  await browser.close();
}
