# Atomic AI retirement transitions

The existing retirement workflow retains draft → approved → executing → completed,
and draft → rejected transitions. Admin authorization, exact confirmation text,
evidence reference/hash and the seven verification acknowledgements remain required.
The creator cannot approve their own plan, and the executor cannot verify their
own execution. Actor comparison now ignores email case and surrounding whitespace.

`PATCH /api/ai/decommission` requires `expectedUpdatedAt` from the plan returned by
GET. Native confirmation forms send their displayed version. External integrations
must add this field; missing/stale versions return 409. On conflict the native UI
closes the old confirmation and reloads; it never automatically resubmits.

A single D1 batch transaction:

1. Conditionally updates the plan against its reviewed snapshot and the current
   model status/version. A configured replacement must still be approved.
2. On verification, retires the model only if the preceding plan update succeeded.
3. Inserts the existing activity event only if the preceding write succeeded.

Sequential SQLite `changes()` guards prevent dependent writes from a losing
request. Model or activity SQL failures roll the entire batch back. A concurrent
plan/model change returns 409 with no transition side effects. Rejected plans can
still be closed when a linked model is missing. There is no schema migration.
Creation and CSV export keep their existing separate activity logging; this
transaction guarantee applies to lifecycle PATCH operations.

The evidence reference, hash and checkboxes remain human-supplied attestations.
The platform records governed retirement; it does not itself erase external model
files, disable traffic or independently verify physical data deletion.

Validation uses the production transition function with SQLite transactions and
injected failures/races. Isolated browser QA uses two real local Admin accounts,
checks maker/executor separation, deliberately fails an audit insert to prove
rollback, then verifies stale-form recovery and successful atomic retirement.
