# Complete QA across sandboxed report previews

The November 14 workspace and production scans stopped on Reporting for roughly
30 minutes and then lost their session. The report preview uses an empty iframe
sandbox and a restrictive CSP. The axe Playwright wrapper probes script execution
inside that frame and stalls; no final report was produced. Workflow retries
then erased the partial evidence and repeated the same failure.

Audit every document using trusted test instrumentation through Playwright,
retaining the report sandbox and CSP. Sandboxed documents also block axe timers;
scan their rendered DOM copies in a separate unauthenticated context with all
network requests blocked, active content removed and restrictive CSP retained.
Record this mode explicitly; it is document-content coverage, not execution
inside the protected frame. Preserve frame-qualified findings and
manual-review results. Bound scans to 30 seconds and make incomplete scans fail
the gate, with incremental evidence. Remove blind full-scan retries. No changes
to customer authentication, session lifetime, business records or report security.

Acceptance: a deliberately inaccessible sandboxed document and its host both
produce findings, document scripts remain blocked, stalled scans fail explicitly,
and the real Reporting preview and the complete bilingual gate finish. Run the
focused regression before the application scan; keep product findings visible.

Reference: https://github.com/dequelabs/axe-core-npm/blob/develop/packages/playwright/src/index.ts
The completed scan on e57189f also surfaced existing product defects: four low
contrast identity badges/avatars, five workspace heading scales exceeding the
existing 24px page/18px section range, and orphan tooltip descriptions after
hover followed by keyboard focus. Administrators must be able to distinguish
account state and navigate compact menus without stale accessible descriptions.
Use existing theme tokens, align headings, preserve the original tooltip
description across repeated activation, and give named control groups valid
semantics. Enlarge report section checkboxes to 24px within their existing
30px labels. No layout redesign or authorization/workflow changes.

Acceptance: complete both locale scans with no high findings, verify tooltip
cleanup after hover/focus/Escape, preserve report exports and sandbox, and check
changed modules in both themes. Validation and release pending on this revision.

## Populated vendor follow-up

Production revision 666afe6 completed the scan and exposed one repeatable
contrast failure in a populated vendor priority card (4.17:1). The grid header
counter selector also matched nested card status labels, overriding their
neutral styling. Limit counters to section headers; retain severity styling.
Add a populated card regression in both themes and locales, checking actual
rendered contrast. Update the older layout test's 26px heading expectation to
the accepted 24px heading. No business data or authorization changes.
