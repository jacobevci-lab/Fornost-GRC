import type { ConnectedSourceIssue } from "./connected-grc-loader";
const labels: Record<ConnectedSourceIssue["key"], [string, string]> = {
  findings: ["Bulgular ve CAPA", "Findings & CAPA"],
  incidents: ["Güvenlik Olayları", "Security Incidents"],
  continuity: ["İş Sürekliliği", "Business Continuity"],
  policy: ["Politika Merkezi", "Policy Center"],
  riskAppetite: ["Risk İştahı ve KRI", "Risk Appetite & KRI"],
  regulatory: ["Regülasyon Merkezi", "Regulatory Change"],
  thirdParty: ["Tedarikçiler", "Vendor Management"],
  evidenceAutomation: ["Kanıt Otomasyonu", "Evidence Automation"],
  aiModels: ["AI model envanteri", "AI model inventory"],
  aiAlerts: ["AI güvence uyarıları", "AI assurance alerts"],
  aiFindings: ["AI bulguları", "AI findings"],
};
const reasons: Record<ConnectedSourceIssue["reason"], [string, string]> = {
  timeout: ["Yanıt süresi aşıldı", "Request timed out"],
  access: ["Oturum veya erişim izni gerekli", "Session or access permission required"],
  unavailable: ["Kaynağa ulaşılamadı", "Source unavailable"],
  invalid: ["Kaynak yanıtı okunamadı", "Source response could not be read"],
  incomplete: ["Veri kapsamı eksik", "Dataset is incomplete"],
};
export function connectedSourceIssueText(issue: ConnectedSourceIssue, lang: "tr" | "en") {
  const index = lang === "tr" ? 0 : 1;
  return `${labels[issue.key][index]}: ${reasons[issue.reason][index]}`;
}
