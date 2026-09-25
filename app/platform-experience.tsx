import FornostAiCopilot from "./fornost-ai-copilot";
import ProductionHardening from "./production-hardening";
import NavigationIntegrity from "./navigation-integrity";
import NavigationFocusBridge from "./navigation-focus-bridge";
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
import MyWorkAssuranceSignals from "./my-work-assurance-signals";
import ProgressiveFormExperience from "./progressive-form-experience";
import ControlImpactLens from "./control-impact-lens";
import FindingLineageLens from "./finding-lineage-lens";
import AuditReadinessGate from "./audit-readiness-gate";
import EvidenceQualityLens from "./evidence-quality-lens";
import ConnectorOnboardingWizard from "./connector-onboarding-wizard";

/**
 * Transitional composition root for experience layers that currently augment
 * the legacy single-page GRC shell.
 *
 * Keeping these layers behind one boundary prevents RootLayout from becoming
 * the de-facto product architecture and makes the remaining DOM augmentation
 * debt explicit. As native module workspaces replace legacy surfaces, the
 * compatibility/QA group at the bottom should shrink rather than grow.
 */
export default function PlatformExperience() {
  return (
    <>
      {/* Executive posture. New dashboard work should converge on V9 rather than add another version. */}
      <ExecutiveDashboard />
      <ExecutiveDashboardPreferenceSync />
      <DashboardV7DecisionBoard />
      <DashboardV8Focus />
      <DashboardV9Executive />
      <DashboardMetricHistory />
      <DashboardRuntimeQa />
      <DashboardDataIntegrityDeferred />

      {/* Daily work and connected-assurance experience. */}
      <SidebarIconTooltip />
      <MyWorkV2 />
      <MyWorkAssuranceSignals />
      <ProgressiveFormExperience />
      <ControlImpactLens />
      <FindingLineageLens />
      <AuditReadinessGate />
      <EvidenceQualityLens />
      <ConnectorOnboardingWizard />
      <NavigationFocusBridge />

      {/* One visible AI surface; specialist capabilities remain behind Ask Fornost. */}
      <FornostAiCopilot />

      {/* Compatibility safety nets. Do not add new product functionality here. */}
      <ProductionHardening />
      <NavigationIntegrity />
    </>
  );
}
