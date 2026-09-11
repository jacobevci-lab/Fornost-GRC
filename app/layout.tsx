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
import "./fornost-ai-agents.css";
import "./fornost-ai-knowledge.css";
import "./fornost-ai-readability.css";
import "./fornost-ai-policy.css";
import FornostAiCopilot from "./fornost-ai-copilot";

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";
const normalizedBasePath = configuredBasePath.replace(/\/+$/, "");
const basePath = !normalizedBasePath
  ? ""
  : normalizedBasePath.startsWith("/") ? normalizedBasePath : `/${normalizedBasePath}`;

export const metadata: Metadata = {
  title: "Fornost GRC",
  description: "Govern risk, prove compliance and manage resilience from one workspace.",
  applicationName: "Fornost GRC",
  icons: { icon: `${basePath}/favicon.svg` },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr" data-theme="dark" suppressHydrationWarning><body>{children}<FornostAiCopilot /></body></html>;
}
