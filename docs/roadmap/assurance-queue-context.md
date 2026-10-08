# Assurance queue source context

Queue coverage has two independent dimensions: which work rows were loaded and which related data sources were available. The API now declares `context` as `full`, `without-capa`, or `work-only`.

Legacy missing tables can still return readable work records. Missing canonical CAPA data produces an explicit reference-code warning. Missing finding/rule tables produce a stronger warning: individual SLA labels and operational metrics are unassessed, and review/retest actions are unavailable. Status counters remain useful because they are computed from the work records themselves. Refresh restores normal operation when source context returns. Continuations with a different context level require a fresh read instead of mixing data qualities.

Fallback is restricted to a `no such table` error for the three known joined tables. Locking, timeouts, missing columns, unrelated missing tables and other errors propagate. Search continues to fail closed instead of silently searching a reduced set of fields. The API permission and independent-review checks remain authoritative.

Compatibility: older responses without `context` remain accepted; explicit unrecognized metadata is rejected. This signals table availability, not the integrity of every individual record relationship, and does not provide transactional snapshot consistency.

Validation: SQLite exercises all three source levels. Failure-injection tests prove operational errors do not issue reduced queries. Browser QA checks warnings, withheld metrics/actions, retained work counters, and recovery to complete context.
