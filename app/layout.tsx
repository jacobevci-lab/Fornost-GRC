import type { Metadata } from "next";
import "./globals.css";
import "./risk-governance.css";
import "./reporting.css";
import "./fornost-ai.css";
import "./fornost-ai-audit.css";
import "./fornost-ai-drafts.css";
import "./fornost-ai-review.css";
import "./fornost-ai-publication.css";
import "./fornost-ai-v2.css";
import "./fornost-ai-governance.css";
import "./fornost-ai-model-inventory.css";
import "./fornost-ai-compliance.css";
import "./fornost-ai-lifecycle.css";
import "./fornost-ai-incidents.css";
import "./fornost-ai-agents.css";
import "./fornost-ai-knowledge.css";
import "./fornost-ai-readability.css";
import "./fornost-ai-policy.css";
import "./fornost-ai-evidence.css";
import "./fornost-ai-risks.css";
import "./fornost-ai-vendor-assurance.css";
import "./fornost-ai-access-governance.css";
import "./fornost-ai-release-gate.css";
import "./fornost-ai-impact-assessment.css";
import "./fornost-ai-resilience.css";
import "./fornost-ai-datasets.css";
import "./fornost-ai-regulatory.css";
import "./fornost-ai-obligations.css";
import "./fornost-ai-literacy.css";
import "./fornost-ai-supply-chain.css";
import "./fornost-ai-red-team.css";
import "./fornost-ai-transparency.css";
import "./fornost-ai-continuous-assurance.css";
import "./fornost-ai-assurance-alerts.css";
import "./fornost-ai-portfolio.css";
import "./fornost-ai-exceptions.css";
import "./fornost-ai-navigation.css";
import "./fornost-ai-decommission.css";
import "./fornost-ai-findings.css";
import "./quality-guardrails.css";
import "./sidebar-icon-tooltip.css";
import "./dashboard-structure-v2.css";
import "./dashboard-qa-hardening.css";
import "./dashboard-command-center-v5.css";
import "./dashboard-command-center-v6.css";
import "./dashboard-command-center-v7.css";
import "./dashboard-command-center-v8.css";
import "./dashboard-command-center-v9.css";
import "./dashboard-readability-v11.css";
import "./dashboard-final-polish-v12.css";
import "./dashboard-metric-history.css";
import FornostAiCopilot from "./fornost-ai-copilot";
import ProductionHardening from "./production-hardening";
import NavigationIntegrity from "./navigation-integrity";
import ExecutiveDashboard from "./executive-dashboard";
import ExecutiveDashboardPreferenceSync from "./executive-dashboard-preference-sync";
import DashboardV7DecisionBoard from "./dashboard-v7-decision-board";
import DashboardV8Focus from "./dashboard-v8-focus";
import DashboardV9Executive from "./dashboard-v9-executive";
import DashboardMetricHistory from "./dashboard-metric-history";
import DashboardRuntimeQa from "./dashboard-runtime-qa";
import DashboardDataIntegrityDeferred from "./dashboard-data-integrity-deferred";
import SidebarIconTooltip from "./sidebar-icon-tooltip";
import MyWorkV2 from "./my-work-v2";
import ProgressiveFormExperience from "./progressive-form-experience";
import ControlImpactLens from "./control-impact-lens";
import FindingLineageLens from "./finding-lineage-lens";
import AuditReadinessGate from "./audit-readiness-gate";
import EvidenceQualityLens from "./evidence-quality-lens";
import MyWorkAssuranceSignals from "./my-work-assurance-signals";

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";
const normalizedBasePath = configuredBasePath.replace(/\/+$/, "");
const basePath = !normalizedBasePath
  ? ""
  : normalizedBasePath.startsWith("/")
    ? normalizedBasePath
    : `/${normalizedBasePath}`;

export const metadata: Metadata = {
  title: "Fornost GRC · Enterprise Risk & AI Governance",
  description:
    "Enterprise risk, compliance, evidence, resilience and governed AI assurance in one secure cloud or on-premises workspace.",
  applicationName: "Fornost GRC",
  icons: { icon: `${basePath}/favicon.svg` },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" data-theme="light" suppressHydrationWarning>
      <body>
        {children}
        <ExecutiveDashboard />
        <ExecutiveDashboardPreferenceSync />
        <DashboardV7DecisionBoard />
        <DashboardV8Focus />
        <DashboardV9Executive />
        <DashboardMetricHistory />
        <DashboardRuntimeQa />
        <DashboardDataIntegrityDeferred />
        <SidebarIconTooltip />
        <MyWorkV2 />
        <MyWorkAssuranceSignals />
        <ProgressiveFormExperience />
        <ControlImpactLens />
        <FindingLineageLens />
        <AuditReadinessGate />
        <EvidenceQualityLens />
        <FornostAiCopilot />
        <ProductionHardening />
        <NavigationIntegrity />
      </body>
    </html>
  );
}
