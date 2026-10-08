# Assurance queue source context

Queue coverage has two independent dimensions: which work rows were loaded and which related data sources were available. The API now declares `context` as `full`, `without-capa`, or `work-only`.

Legacy missing tables can still return readable work records. Missing canonical CAPA data produces an explicit reference-code warning. Missing finding/rule tables produce a stronger warning: individual SLA labels and operational metrics are unassessed, and review/retest actions are unavailable. Status counters remain useful because they are computed from the work records themselves. Refresh restores normal operation when source context returns. Continuations with a different context level require a fresh read instead of mixing data qualities.

Fallback is restricted to a `no such table` error for the three known joined tables. Locking, timeouts, missing columns, unrelated missing tables and other errors propagate. Search continues to fail closed instead of silently searching a reduced set of fields. The API permission and independent-review checks remain authoritative.

Each work row also declares `sourceState`: `linked`, `missing-finding`, `missing-rule`, `rule-mismatch`, or `unavailable`. Relationships are checked by stored IDs, including whether the finding still belongs to the work item's rule. Display titles are not used to infer integrity. Broken rows show an unassessed SLA and withhold approval/retest buttons; intact rows remain actionable. An independent Admin can still open Reject and supply a 10–1200 character reason to retire an obsolete request. The dialog explicitly distinguishes rejection from remediation of the underlying finding, risk or control. Missing whole source tables (`work-only`) continue to disable all UI write actions. Active broken rows appear in Attention and suppress the overall SLA percentage. Work status counters remain available. Approval rechecks the source relationship server-side and returns 409 when it is broken; explicit rejection through the API remains available to retire obsolete work.

Compatibility: older responses without `context` or `sourceState` remain accepted; explicit unrecognized metadata is rejected. These checks do not provide transactional snapshot consistency or validate every downstream control, risk, evidence or CAPA relationship.

Validation: SQLite exercises all three source levels. Failure-injection tests prove operational errors do not issue reduced queries. Browser QA checks warnings, withheld metrics/actions, retained work counters, and recovery to complete context.

## Status scope

`GET /api/continuous-assurance?filter=active|review|retest|attention|all` applies an exact status predicate before the 501-row sentinel query. Omission preserves the existing `all` API behavior. Unknown filters return 400. Search and cursor predicates compose with the status scope, including the legacy source-table fallbacks. Returned `filter` describes the scope; coverage and summary describe that result, not the full organization backlog.

Selecting Active, Review, Re-test or All reloads the first matching page. Search, refresh, post-write reconciliation and continuation preserve the selected server scope. The client checks the echoed scope and every returned row before enabling work actions; continuation cannot combine different scopes. An explicit scope label explains why counters or metrics change. The initial compatible all-record read retains the active display filter until a scope is selected.

Attention is evaluated server-side using the same strict timestamp, severity, action and source-integrity rules as the client. It scans the active status query, returning up to 500 matches after examining at most 2,000 active rows per request. Search is applied before scanning. Its cursor follows the last examined row, including healthy rows: empty partial results still offer a continuation and explicitly avoid an all-clear message or complete totals. The UI shows cumulative scanned records and matching work.

An `assessmentAt` UTC instant is fixed for the scan and sent as `at` on continuation. The server rejects missing, noncanonical, future or older-than-24-hour continuation assessments. The client rejects changed assessment times, inconsistent scan metadata and nonadvancing continuations. Attention labels and metrics retain the assessment time; Refresh starts a new assessment and includes newly breached work. No timer silently expands a completed subset without a server read.

Known missing source tables remain visible as unknown-SLA work, with write restrictions preserved. Operational errors and source-context changes across scan batches fail rather than silently returning a reduced result. Keyset pagination is still a live view, not a transactional snapshot; a fixed assessment instant does not freeze concurrent record edits.
