# Reporting PDF action contrast

Production QA run 37634086557 flagged the dark Reporting PDF action at 2.83:1 (#0b1717 foreground on #386570 background). Its report was loading at the captured state. The legacy global primary/hover colors and reporting disabled opacity did not form a stable readable pair.

Reporting now owns an opaque foreground/background pair for its PDF action in light/dark, enabled/disabled and hover states. Disabled remains a native disabled button with a distinct neutral palette; no export gating is changed. Color transitions are disabled for this action so readiness changes cannot interpolate through an unreadable pair.

The reporting browser regression measures actual computed contrast in all eight states and requires 4.5:1 plus opacity 1, including native disabled state after an unavailable CAPA source and enabled state after recovery. Production QA remains unchanged and must pass after deployment.
