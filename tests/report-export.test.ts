import assert from "node:assert/strict";
import test from "node:test";
import { buildReportHtml, buildReportPdf, reportMetrics } from "../app/report-export";

test("module reports calculate domain-specific management KPIs", () => {
  const risks = [
    { module: "Risk Assessment", data: { inherentLikelihood: "4", inherentImpact: "4", status: "Açık" } },
    { module: "Risk Assessment", data: { inherentLikelihood: "2", inherentImpact: "3", status: "Kapalı" } },
  ];
  const metrics = reportMetrics("Risk Assessment", risks, true);
  assert.equal(metrics[0].value, 2);
  assert.equal(metrics[1].value, "11.0");
  assert.equal(metrics[2].value, 1);
  assert.equal(metrics[3].value, 1);
});

test("HTML report includes KPI, distribution and record table", () => {
  const rows = [{ module: "Varlık Envanteri", data: { assetName: "M365 Tenant", status: "Aktif", owner: "BT" } }];
  const metrics = reportMetrics("Varlık Envanteri", rows, true);
  const html = buildReportHtml("Varlık Raporu", rows, metrics, true);
  assert.match(html, /<!doctype html>/);
  assert.match(html, /Durum dağılımı/);
  assert.match(html, /M365 Tenant/);
});

test("PDF report is a downloadable multi-object PDF document", async () => {
  const rows = [{ module: "BIA", data: { process: "Ödeme Süreci", status: "Aktif" } }];
  const pdf = buildReportPdf("BIA Raporu", reportMetrics("BIA", rows, true), rows, true);
  const signature = Buffer.from(await pdf.arrayBuffer()).subarray(0, 8).toString();
  assert.match(signature, /^%PDF-1\.4/);
  assert.equal(pdf.type, "application/pdf");
});
