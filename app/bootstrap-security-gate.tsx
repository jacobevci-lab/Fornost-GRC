"use client";

import { useEffect } from "react";
import { withBasePath } from "./base-path";

export default function BootstrapSecurityGate() {
  useEffect(() => {
    const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim().replace(/\/+$/, "") || "";
    const pathname = window.location.pathname;
    const setupPath = `${configuredBasePath}/setup` || "/setup";
    if (pathname === setupPath || pathname.startsWith(`${setupPath}/`)) return;

    const controller = new AbortController();
    void fetch(withBasePath("/api/auth"), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const state = await response.json().catch(() => ({}));
        if (state.bootstrapAuthorizationRequired === true) {
          window.location.replace(withBasePath("/setup"));
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  return null;
}
