import FornostAiCopilot from "./fornost-ai-copilot";
import FornostAiSourceNavigation from "./fornost-ai-source-navigation";
import ProductionHardening from "./production-hardening";
import NavigationIntegrity from "./navigation-integrity";
import NavigationFocusBridge from "./navigation-focus-bridge";
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
      {/* Dashboard is rendered natively by the page; no DOM-injected versions. */}

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
      <FornostAiSourceNavigation />

      {/* Compatibility safety nets. Do not add new product functionality here. */}
      <ProductionHardening />
      <NavigationIntegrity />
    </>
  );
}
