# Audit readiness with complete scope and explicit verification state

Audit Management keeps its existing readiness panel. A read-only `GET /api/audits/readiness?auditName=...` now evaluates its evidence and continuous assurance from the same server result and evaluation time. Omit the name for the portfolio; names use exact normalized matching. This is a live assessment snapshot, not an immutable audit opinion or external certification.

## Scope and reliability

- Build the available signal set before applying scope, independently of the operational dashboard's top-100 display limit.
- Rule and finding signals include every mapped control. Governed work uses its explicit target; a test of one control does not certify another.
- A later completed re-test with a stored passing reconciliation outcome matching its result reference resolves older error/failure signals for the same finding, rule and target. History stays in the work queue. Pending, legacy, earlier or mismatched outcomes do not resolve an error.
- Loading, transport errors, missing sources, malformed records, unmapped requirements and incomplete reads cannot display `AUDIT READY`. The panel identifies the reason and provides retry. Last-known data does not receive a new successful-check timestamp after failure, and unavailable/unverified results cannot be exported.
- Empty successfully read sources are distinguished from unavailable sources. Requirements without automated controls may rely on approved manual evidence; their count is explicitly shown.
- Bounds are explicit: 10,000 audit/evidence records, 10,000 rules, 1,000 findings and 1,000 work items. Hitting a limit produces an unverified evaluation, even if the sampled rows look healthy. Findings/work limits cover installation history, so a large installation may require a future scoped paging implementation. Integrity verification uses the existing 200-evidence/5,000-version bounds, restricted to rules mapped to the audit's controls. No file content or vendor API is fetched by readiness.

## Evidence and exports

Repeated control/requirement references no longer double-count a linked evidence record. Approved status alone is insufficient if validation failed or supplied expiry metadata is invalid. Both expiry fields are checked: date-only values remain usable through that UTC day, and timestamps expire at their exact instant, including offsets. Draft/unapproved evidence still requires approval; expiry is never inferred from a report download date.

All gaps and scoped signals are reachable using show-more inside compact details sections. Reports include the entire evaluated scope, independently of visible row counts. HTML respects Turkish/English and has print styles; CSV retains stable column identifiers and includes audit name, evaluation time and gate. Spreadsheet formula-like cells are neutralized. The evaluation time is reused from the server response, not replaced with the download time.

## Access and verification

Existing Admin/Editor/Viewer full-workspace reads remain supported. Scoped users retain the closed shared-endpoint boundary; readiness does not broaden their access to controls or evidence. The endpoint does not close findings, approve evidence or change risk ratings.

Real SQLite regression tests exercise scope, truncation, source failure, exact expiry, recovery and history. The localhost-only browser scenario uses actual API/DB reads for blockers, malformed records and recovery; only the transport-error case is deliberately substituted. It checks authorization, both themes/mobile, all result rows, bilingual exports and cleanup before the broader CRUD suite. Live vendor credentials and customer deployment verification are separate.
