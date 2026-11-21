"use client";
import PlatformEscape from "./platform-escape";
import FornostAiCopilot from "./fornost-ai-copilot";
import FornostAiSourceNavigation from "./fornost-ai-source-navigation";
import ProductionHardening from "./production-hardening";
import NavigationIntegrity from "./navigation-integrity";
import NavigationFocusBridge from "./navigation-focus-bridge";
import SidebarIconTooltip from "./sidebar-icon-tooltip";
import ProgressiveFormExperience from "./progressive-form-experience";

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
      <PlatformEscape />
      {/* Dashboard is rendered natively by the page; no DOM-injected versions. */}

      {/* Daily work and connected-assurance experience. */}
      <SidebarIconTooltip />
      <ProgressiveFormExperience />
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
