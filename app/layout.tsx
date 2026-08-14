import type { Metadata } from "next";
import "./globals.css";
import "./risk-governance.css";
import "./reporting.css";

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
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
