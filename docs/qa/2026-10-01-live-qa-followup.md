# Live QA follow-up — 1 October 2026

## Confirmed findings and fixes

1. Audit requirements due today appeared overdue on the executive dashboard while the audit portfolio correctly reported zero overdue requirements. Date-only deadlines now expire at the end of their UTC calendar day, matching API comparisons. Both dashboard implementations and both My Work implementations use the same helper. Timestamp deadlines preserve their exact time and offset; missing or invalid dates are not overdue.
2. A BIA search returning no matches displayed “No records yet,” incorrectly suggesting that the existing records were absent. Core register empty states now describe the current view and direct users to check search and filters.
3. Live BIA-001 displayed a linked asset in its table but “Select” in the edit form because that asset was absent from the current inventory. Asset/process pickers now retain existing references and explicitly label unavailable links. Existing data is not silently presented as empty; this does not recreate deleted inventory records. Risk multi-selection retains the same behavior for existing references.

## Reproducible validation

- 691 unit/regression tests, including UTC deadline boundaries, exact timestamp offsets and invalid dates.
- TypeScript, ESLint, production build, 83 SQL migration preflight and on-prem installer smoke checks.
- `workspace-layout-qa.mjs`: 27 module navigation entries × two languages × two themes × three viewport widths = 324 screen states; overflow, audit stability, evidence colors, warm surfaces, compact fonts and Connected GRC interactions.
- `comprehensive-runtime-qa.mjs`: API CRUD/role boundaries for all eight core record types; browser Risk/BIA/Asset/Compliance/Control CRUD; evidence file integrity and CRUD; governance lifecycle checks and AI workspace render coverage. Added actual dashboard count assertions for today's/yesterday's/completed audit requirements, empty search assertions and retained BIA references with zero RPO.
- `full-product-qa-gate.mjs`: automated accessibility, responsive navigation/localization and runtime checks. The earlier scope report documents gate exclusions and lifecycle coverage: `2026-10-01-continuity-full-qa.md`.

The PR's CI and Workspace Layout QA runs are the authoritative pass/fail evidence for the current revision. Workflow artifacts contain JSON results, screenshots and logs. These tests use a fresh isolated database at fixed loopback URL, not production data.

## Live coverage and unresolved limits

The live site is reachable and the authorized test account authenticated. Twenty-five module pages were opened in each theme with heading/overflow checks. Evidence title/code colors, warm surfaces, all six evidence automation views, continuity layout, required-form validation, BIA edit values and empty search were inspected. An ISO audit with 93 requirements was created, a requirement was edited to 25% progress, and its saved state was verified. This does not constitute all live CRUD or every possible workflow combination.

The browser credential-observation safeguard blocked native delete-dialog handling and screenshot/handoff operations. Ordinary DOM reading and some UI navigation remained available. No lower-level browser or production HTTP bypass was used. **The live test audit `QA-20261001 Canlı Denetim` remains; its cleanup is not verified.** No other live record was changed during this follow-up.

External SMTP delivery, SSO/LDAP federation, ticket/webhook delivery, actual third-party evidence collection and hosted AI responses are not verified without configured services. AI workspace render checks and model draft CRUD do not verify every AI lifecycle transition. Automated accessibility checks do not replace screen-reader and human usability testing. Isolated QA success does not establish that a deployment has reached production.
