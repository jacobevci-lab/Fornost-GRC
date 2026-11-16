# Complete QA across sandboxed report previews

The November 14 workspace and production scans stopped on Reporting for roughly
30 minutes and then lost their session. The report preview uses an empty iframe
sandbox and a restrictive CSP. The axe Playwright wrapper probes script execution
inside that frame and stalls; no final report was produced. Workflow retries
then erased the partial evidence and repeated the same failure.

Audit every document using trusted test instrumentation through Playwright,
retaining the report sandbox and CSP. Preserve frame-qualified findings and
manual-review results. Bound scans to 30 seconds and make incomplete scans fail
the gate, with incremental evidence. Remove blind full-scan retries. No changes
to customer authentication, session lifetime, business records or report security.

Acceptance: a deliberately inaccessible sandboxed document and its host both
produce findings, document scripts remain blocked, stalled scans fail explicitly,
and the real Reporting preview and the complete bilingual gate finish. Run the
focused regression before the application scan; keep product findings visible.

Reference: https://github.com/dequelabs/axe-core-npm/blob/develop/packages/playwright/src/index.ts
Validation and release: pending on this revision.
