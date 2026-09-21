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
import FornostAiCopilot from "./fornost-ai-copilot";
import ProductionHardening from "./production-hardening";
import NavigationIntegrity from "./navigation-integrity";
import DashboardRetirement from "./dashboard-retirement";
import SidebarIconTooltip from "./sidebar-icon-tooltip";

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
        <DashboardRetirement />
        <SidebarIconTooltip />
        <FornostAiCopilot />
        <ProductionHardening />
        <NavigationIntegrity />
      </body>
    </html>
  );
}
