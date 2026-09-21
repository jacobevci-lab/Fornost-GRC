"use client";

import { useEffect } from "react";

const RETIRED_DASHBOARD_SELECTOR = ".dashboard-shortcuts";

function removeRetiredDashboardWorkspace() {
  document.querySelectorAll(RETIRED_DASHBOARD_SELECTOR).forEach((element) => element.remove());
}

export default function DashboardRetirement() {
  useEffect(() => {
    removeRetiredDashboardWorkspace();

    const observer = new MutationObserver(() => removeRetiredDashboardWorkspace());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
