# Distinct AI assurance observations

Repeated POST `/api/ai/assurance-alerts` scans no longer inflate occurrence counts.
An identical monitoring reference, title, severity, observed value and threshold
is a no-op: count, last-seen timestamp and decision revision remain unchanged.
A new measurement reference counts even when its numerical value is the same.
Changed breach details also count, including increasing measurement age. The
counter represents distinct observed breach snapshots, not scan attempts.

A single conditional UPSERT replaces read-then-insert/update, so concurrent scans
of the same snapshot produce one observation. Human status, owner, note and CAPA
link are preserved. Resolved alerts remain unchanged; automatic reopening is not
introduced. Latest-measurement selection is deterministic on recorded_at then ID.

At write time the policy must still be approved, unexpired and at the reviewed
version; the model must not be retired and its risk tier must still match. The
selected monitoring reference must still be the latest. An older scan cannot
replace a newer alert snapshot. Skipped/conflicting candidates are not counted as
updates. Each committed observation and its activity event share one D1 batch;
audit failure rolls back that observation.

POST retains `created` and `updated` and adds `unchanged`, which includes unchanged,
resolved or stale-source candidates. The native scan notice explains these
counts. `lastSeenAt` now reflects the last distinct accepted observation, not the
last scan. No schema migration or historical counter repair is performed.

The 500-policy scan remains bounded. The entire scan is not one transaction:
earlier candidates may be committed if a later candidate or final summary audit
fails. The API returns a structured 503; rescanning identical observations is
safe and does not increment them again. Each changed observation has its own
atomic audit event; the final scan-summary event is separate.

Validation covers SQLite races, repeated scans, source changes, null measurements,
resolved alarms and audit rollback. Isolated authenticated API/browser QA executes
concurrent POST scans, unchanged UI scans and new-measurement updates. Production
deployment is not asserted.
