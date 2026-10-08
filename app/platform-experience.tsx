"use client";
import { useEffect, useState } from "react";
import PlatformEscape from "./platform-escape";
import FornostAiCopilot from "./fornost-ai-copilot";
import FornostAiSourceNavigation from "./fornost-ai-source-navigation";
import ProductionHardening from "./production-hardening";
import NavigationIntegrity from "./navigation-integrity";
import NavigationFocusBridge from "./navigation-focus-bridge";
import SidebarIconTooltip from "./sidebar-icon-tooltip";
import MyWorkV2 from "./my-work-v2";
import ProgressiveFormExperience from "./progressive-form-experience";
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
  const [fullWorkspace,setFullWorkspace] = useState(false);
  useEffect(()=>{
    const sync=()=>setFullWorkspace(document.querySelector('.shell[data-module-scope="full"]')!==null);
    sync();const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["data-module-scope"]});
    return()=>observer.disconnect();
  },[]);
  return (
    <>
      <PlatformEscape />
      {/* Dashboard is rendered natively by the page; no DOM-injected versions. */}

      {/* Daily work and connected-assurance experience. */}
      <SidebarIconTooltip />
      {fullWorkspace && <MyWorkV2 />}
      <ProgressiveFormExperience />
      {fullWorkspace && <EvidenceQualityLens />}
      {fullWorkspace && <ConnectorOnboardingWizard />}
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
