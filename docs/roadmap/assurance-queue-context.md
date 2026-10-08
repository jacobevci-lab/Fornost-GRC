# Assurance queue source context

Queue coverage has two independent dimensions: which work rows were loaded and which related data sources were available. The API now declares `context` as `full`, `without-capa`, or `work-only`.

Legacy missing tables can still return readable work records. Missing canonical CAPA data produces an explicit reference-code warning. Missing finding/rule tables produce a stronger warning: individual SLA labels and operational metrics are unassessed, and review/retest actions are unavailable. Status counters remain useful because they are computed from the work records themselves. Refresh restores normal operation when source context returns. Continuations with a different context level require a fresh read instead of mixing data qualities.

Fallback is restricted to a `no such table` error for the three known joined tables. Locking, timeouts, missing columns, unrelated missing tables and other errors propagate. Search continues to fail closed instead of silently searching a reduced set of fields. The API permission and independent-review checks remain authoritative.

Each work row also declares `sourceState`: `linked`, `missing-finding`, `missing-rule`, `rule-mismatch`, or `unavailable`. Relationships are checked by stored IDs, including whether the finding still belongs to the work item's rule. Display titles are not used to infer integrity. Broken rows show an unassessed SLA and withhold approval/retest buttons; intact rows remain actionable. An independent Admin can still open Reject and supply a 10–1200 character reason to retire an obsolete request. The dialog explicitly distinguishes rejection from remediation of the underlying finding, risk or control. Missing whole source tables (`work-only`) continue to disable all UI write actions. Active broken rows appear in Attention and suppress the overall SLA percentage. Work status counters remain available. Approval rechecks the source relationship server-side and returns 409 when it is broken; explicit rejection through the API remains available to retire obsolete work.

Compatibility: older responses without `context` or `sourceState` remain accepted; explicit unrecognized metadata is rejected. These checks do not provide transactional snapshot consistency or validate every downstream control, risk, evidence or CAPA relationship.

Validation: SQLite exercises all three source levels. Failure-injection tests prove operational errors do not issue reduced queries. Browser QA checks warnings, withheld metrics/actions, retained work counters, and recovery to complete context.

## Status scope

`GET /api/continuous-assurance?filter=active|review|retest|all` applies an exact status predicate before the 501-row sentinel query. Omission preserves the existing `all` API behavior. Unknown filters return 400. Search and cursor predicates compose with the status scope, including the legacy source-table fallbacks. Returned `filter` describes the scope; coverage and summary describe that result, not the full organization backlog.

Selecting Active, Review, Re-test or All reloads the first matching page. Search, refresh, post-write reconciliation and continuation preserve the selected server scope. The client checks the echoed scope and every returned row before enabling work actions; continuation cannot combine different scopes. An explicit scope label explains why counters or metrics change. The initial compatible all-record read retains the active display filter until a scope is selected.

Attention remains a client-side SLA assessment over the all-record query because its membership also depends on timestamps and source integrity. Selecting Attention resets the server status scope to all. A partial result explicitly warns that additional records must be loaded; this is not a global SLA search. Keyset pagination is still a live view, not a transactional snapshot.
