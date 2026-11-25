"use client";

import { useEffect, useState } from "react";
import DashboardDataIntegrity from "./dashboard-data-integrity";

const INITIAL_INTEGRITY_DELAY_MS = 12_000;

export default function DashboardDataIntegrityDeferred() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), INITIAL_INTEGRITY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return ready ? <DashboardDataIntegrity /> : null;
}
