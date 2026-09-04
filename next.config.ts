import type { NextConfig } from "next";

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";
const normalizedBasePath = configuredBasePath.replace(/\/+$/, "");
const basePath = !normalizedBasePath
  ? ""
  : normalizedBasePath.startsWith("/") ? normalizedBasePath : `/${normalizedBasePath}`;

const nextConfig: NextConfig = {
  basePath,
  assetPrefix: basePath || undefined,
  async headers() {
    const securityHeaders = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "Content-Security-Policy", value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self'; style-src-elem 'self'; style-src-attr 'unsafe-inline'; script-src 'self' 'unsafe-inline'; script-src-attr 'none'; connect-src 'self'; frame-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
