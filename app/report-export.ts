export type ReportRecord = { module: string; data: Record<string, string> };
export type ReportMetric = { label: string; value: string | number; note: string };

const num = (value?: string) => Number.parseFloat(String(value || "").replace(",", ".")) || 0;
const truthy = (value?: string) => /^(evet|yes|true|var|aktif|active|uyumlu|compliant|implemented)$/i.test(value || "");
const isOpen = (value?: string) => !/^(kapalı|closed|tamamlandı|completed|uyumlu|compliant|accepted|kabul edildi)$/i.test(value || "");
const riskScore = (row: ReportRecord) => num(row.data.calculatedImpact) || num(row.data.inherentLikelihood) * num(row.data.inherentImpact);
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

export function reportMetrics(module: string, rows: ReportRecord[], tr: boolean): ReportMetric[] {
  const total = rows.length;
  const count = (fn: (row: ReportRecord) => boolean) => rows.filter(fn).length;
  const base: ReportMetric = { label: tr ? "Toplam kayıt" : "Total records", value: total, note: tr ? "Seçili rapor kapsamı" : "Selected report scope" };
  if (module === "Risk Assessment") {
    const scores = rows.map(riskScore);
    return [base,
      { label: tr ? "Ortalama risk skoru" : "Average risk score", value: average(scores).toFixed(1), note: tr ? "Olasılık × etki" : "Likelihood × impact" },
      { label: tr ? "Yüksek / kritik" : "High / critical", value: scores.filter((x) => x >= 10).length, note: tr ? "Skor 10 ve üzeri" : "Score 10 or above" },
      { label: tr ? "Açık risk" : "Open risks", value: count((r) => isOpen(r.data.status)), note: tr ? "Kapatılmamış kayıt" : "Not closed" },
    ];
  }
  if (module === "BIA") {
    const impacts = rows.map((r) => Math.max(num(r.data.financial), num(r.data.operational), num(r.data.legal), num(r.data.reputation), num(r.data.customer), num(r.data.dataImpact)));
    return [base,
      { label: tr ? "Kritik süreç" : "Critical processes", value: count((r) => /kritik|critical/i.test(r.data.criticality || "")), note: tr ? "İş sürekliliği önceliği" : "Continuity priority" },
      { label: tr ? "Ortalama etki" : "Average impact", value: average(impacts).toFixed(1), note: tr ? "En yüksek etki boyutu" : "Highest impact dimension" },
      { label: "RTO ≤ 24s", value: count((r) => num(r.data.rto) > 0 && num(r.data.rto) <= 24), note: tr ? "Hızlı kurtarma hedefi" : "Fast recovery target" },
    ];
  }
  if (module === "Varlık Envanteri") return [base,
    { label: tr ? "Kritik varlık" : "Critical assets", value: count((r) => /kritik|critical/i.test(r.data.criticality || "")), note: tr ? "En yüksek kritiklik" : "Highest criticality" },
    { label: tr ? "İnternete açık" : "Internet exposed", value: count((r) => truthy(r.data.internetFacing) || /internet/i.test(r.data.exposure || "")), note: tr ? "Dış saldırı yüzeyi" : "External attack surface" },
    { label: tr ? "Aktif varlık" : "Active assets", value: count((r) => /aktif|active/i.test(r.data.status || r.data.lifecycle || "")), note: tr ? "Kullanımdaki envanter" : "In-use inventory" },
  ];
  if (module === "Uyum" || module === "Kontroller") return [base,
    { label: tr ? "Uygulanan / uyumlu" : "Implemented / compliant", value: count((r) => /uygulandı|implemented|uyumlu|compliant|aktif|active/i.test(r.data.status || r.data.implementation || "")), note: tr ? "Olumlu kontrol sonucu" : "Positive control result" },
    { label: tr ? "Açık / kısmi" : "Open / partial", value: count((r) => /açık|open|kısmi|partial|eksik|missing/i.test(r.data.status || r.data.implementation || "")), note: tr ? "İyileştirme gerektirir" : "Requires improvement" },
    { label: tr ? "Kanıtlı kayıt" : "Records with evidence", value: count((r) => num(r.data.evidenceCount) > 0 || truthy(r.data.hasEvidence)), note: tr ? "Kanıt kapsamı" : "Evidence coverage" },
  ];
  if (module === "Tedarikçiler") return [base,
    { label: tr ? "Kritik tedarikçi" : "Critical vendors", value: count((r) => /kritik|critical/i.test(r.data.criticality || "")), note: tr ? "Yüksek bağımlılık" : "High dependency" },
    { label: tr ? "Yüksek risk" : "High risk", value: count((r) => /yüksek|high|kritik|critical/i.test(r.data.riskLevel || "")), note: tr ? "Risk takibi gerekir" : "Requires risk tracking" },
    { label: tr ? "Aktif hizmet" : "Active services", value: count((r) => /aktif|active/i.test(r.data.status || "")), note: tr ? "Devam eden sözleşme" : "Ongoing engagement" },
  ];
  if (module === "Denetim Yönetimi") return [base,
    { label: tr ? "Ortalama ilerleme" : "Average progress", value: `%${average(rows.map((r) => num(r.data.progress))).toFixed(0)}`, note: tr ? "Denetim maddeleri" : "Audit requirements" },
    { label: tr ? "Kanıt bekleyen" : "Awaiting evidence", value: count((r) => /kanıt bekliyor|awaiting evidence/i.test(r.data.evidenceStatus || "")), note: tr ? "Açık kanıt talebi" : "Open evidence request" },
    { label: tr ? "Kapatılan" : "Closed", value: count((r) => /kapalı|closed|tamamlandı|completed/i.test(r.data.status || "")), note: tr ? "Tamamlanan madde" : "Completed requirement" },
  ];
  if (module === "Kanıtlar") return [base,
    { label: tr ? "Güncel kanıt" : "Current evidence", value: count((r) => /güncel|current|kabul|accepted/i.test(r.data.status || "")), note: tr ? "Geçerli kanıt" : "Valid evidence" },
    { label: tr ? "İnceleme gerekli" : "Needs review", value: count((r) => /inceleme|review|bekliyor|pending/i.test(r.data.status || "")), note: tr ? "Doğrulama kuyruğu" : "Validation queue" },
    { label: tr ? "Bağlantılı" : "Linked", value: count((r) => Boolean(r.data.control || r.data.controlRef || r.data.requirementRef)), note: tr ? "Kontrole bağlı kanıt" : "Evidence linked to control" },
  ];
  return [base,
    { label: tr ? "Aktif" : "Active", value: count((r) => /aktif|active|açık|open/i.test(r.data.status || "")), note: tr ? "Aktif kayıtlar" : "Active records" },
    { label: tr ? "Sahibi atanmış" : "Owner assigned", value: count((r) => Boolean(r.data.owner)), note: tr ? "Sorumluluk kapsamı" : "Accountability coverage" },
    { label: tr ? "İş birimi atanmış" : "Business unit assigned", value: count((r) => Boolean(r.data.businessUnit)), note: tr ? "Organizasyon kapsamı" : "Organization coverage" },
  ];
}

const escapeHtml = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const titleOf = (row: ReportRecord) => row.data.title || row.data.process || row.data.assetName || row.data.vendor || row.data.controlTitle || row.data.requirementTitle || row.data.requirementRef || "—";

export function buildReportHtml(title: string, rows: ReportRecord[], metrics: ReportMetric[], tr: boolean) {
  const statuses = Object.entries(rows.reduce<Record<string, number>>((acc, row) => { const key = row.data.status || (tr ? "Belirtilmedi" : "Unspecified"); acc[key] = (acc[key] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...statuses.map(([, value]) => value));
  return `<!doctype html><html lang="${tr ? "tr" : "en"}"><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:38px}header{border-bottom:3px solid #655cff;padding-bottom:18px}h1{margin:0 0 7px;font-size:27px}small{color:#667085}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.kpi{border:1px solid #dfe3eb;border-radius:12px;padding:16px}.kpi b,.kpi span,.kpi small{display:block}.kpi b{font-size:24px;color:#574fe1}.kpi span{margin:7px 0 4px;font-weight:700}.bars{margin:20px 0}.bar{display:grid;grid-template-columns:160px 1fr 35px;gap:10px;align-items:center;margin:8px 0}.track{height:9px;background:#edf0f5;border-radius:9px}.track i{display:block;height:100%;background:#655cff;border-radius:9px}table{width:100%;border-collapse:collapse;margin-top:22px;font-size:11px}th,td{padding:10px;border-bottom:1px solid #e4e7ec;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f4f5f8;text-transform:uppercase;font-size:9px;letter-spacing:.06em}@media print{body{margin:18mm}.kpi{break-inside:avoid}tr{break-inside:avoid}}@media(max-width:760px){.kpis{grid-template-columns:1fr 1fr}}</style><body><header><h1>${escapeHtml(title)}</h1><small>${tr ? "Oluşturma tarihi" : "Generated"}: ${new Date().toLocaleString(tr ? "tr-TR" : "en-GB")}</small></header><section class="kpis">${metrics.map((m) => `<div class="kpi"><b>${escapeHtml(m.value)}</b><span>${escapeHtml(m.label)}</span><small>${escapeHtml(m.note)}</small></div>`).join("")}</section><h2>${tr ? "Durum dağılımı" : "Status distribution"}</h2><section class="bars">${statuses.map(([label, value]) => `<div class="bar"><span>${escapeHtml(label)}</span><span class="track"><i style="width:${value / max * 100}%"></i></span><b>${value}</b></div>`).join("") || `<small>${tr ? "Dağılım verisi yok." : "No distribution data."}</small>`}</section><table><thead><tr><th>${tr ? "Modül" : "Module"}</th><th>${tr ? "Başlık" : "Title"}</th><th>${tr ? "İş birimi" : "Business unit"}</th><th>${tr ? "Sahip" : "Owner"}</th><th>${tr ? "Durum" : "Status"}</th></tr></thead><tbody>${rows.slice(0, 500).map((r) => `<tr><td>${escapeHtml(r.module)}</td><td>${escapeHtml(titleOf(r))}</td><td>${escapeHtml(r.data.businessUnit)}</td><td>${escapeHtml(r.data.owner)}</td><td>${escapeHtml(r.data.status)}</td></tr>`).join("")}</tbody></table></body></html>`;
}

function pdfSafe(value: unknown) { return String(value ?? "—").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/İ/g, "I").replace(/ş/g, "s").replace(/Ş/g, "S").replace(/ğ/g, "g").replace(/Ğ/g, "G").replace(/ç/g, "c").replace(/Ç/g, "C").replace(/ö/g, "o").replace(/Ö/g, "O").replace(/ü/g, "u").replace(/Ü/g, "U").replace(/[^\x20-\x7E]/g, " ").replace(/[()\\]/g, "\\$&"); }
export function buildReportPdf(title: string, metrics: ReportMetric[], rows: ReportRecord[], tr: boolean) {
  const lines = [title, `${tr ? "Olusturma" : "Generated"}: ${new Date().toLocaleString(tr ? "tr-TR" : "en-GB")}`, "", ...metrics.map((m) => `${m.label}: ${m.value} - ${m.note}`), "", tr ? "Kayit ozeti" : "Record summary", ...rows.slice(0, 80).map((r) => `${r.module} | ${titleOf(r)} | ${r.data.status || "—"}`)];
  const pages: string[][] = []; for (let i = 0; i < lines.length; i += 42) pages.push(lines.slice(i, i + 42));
  const objects: string[] = ["", "<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const pageIds: number[] = [];
  pages.forEach((page) => { const stream = `BT /F1 11 Tf 42 800 Td 14 TL ${page.map((line, i) => `${i ? "T* " : ""}(${pdfSafe(line).slice(0, 105)}) Tj`).join(" ")} ET`; const streamId = objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`) - 1; const pageId = objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`) - 1; pageIds.push(pageId); });
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n"; const offsets = [0]; for (let i = 1; i < objects.length; i++) { offsets[i] = pdf.length; pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`; } const xref = pdf.length; pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export function downloadBlob(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
