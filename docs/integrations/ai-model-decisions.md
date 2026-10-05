# AI model decision integrity

AI model approval and suspension remain Admin-only, human-confirmed operations.
Retired inventory entries are terminal: neither action can reactivate them. A new
model inventory entry is required for a replacement system. Retirement itself
continues to use the existing controlled decommission workflow.

`PATCH /api/ai/models` now requires `expectedUpdatedAt`, copied verbatim from the
model returned by `GET /api/ai/models`, alongside the existing ID, target status,
note and confirmation. Existing integrations must send this field; missing or
stale versions return HTTP 409 without applying a decision. This is an intentional
API safety change. The native model inventory UI sends the displayed version.

Allowed decisions:

| Current status | Approve | Suspend |
| --- | --- | --- |
| draft | Allowed, subject to risk policy | Allowed |
| approved | Conflict; no duplicate decision | Allowed |
| suspended | Allowed, subject to risk policy | Conflict; no duplicate decision |
| retired / unknown | Rejected | Rejected |

Critical models still require control maturity of at least 4 to be approved.
The database update matches the reviewed status, update timestamp, risk tier and
control maturity, and repeats the active-state and critical-risk guards. A
concurrent retirement, edit or policy change therefore rejects the stale write.
Successful decisions advance the timestamp beyond the reviewed version, even
within the same clock millisecond. Only successful updates emit the existing
model decision activity event in the same database transaction.

On conflict, the UI dismisses the old confirmation and reloads the model. It does
not automatically reapply the decision to the newly loaded record. Network errors
also refresh before another attempt. This does not introduce new independent
approver requirements or change the separate decommission-plan transaction model.

Verification includes SQLite execution of the actual decision function, injected
read/write races, terminal-state and critical-risk checks, and isolated browser
QA using real model APIs. Browser QA opens a decision, changes the draft through
the API, verifies rejection and refresh, then explicitly approves the new version.
Retired fixtures reject both operations and retain their stored metadata.

## Draft editing and deletion

`PUT /api/ai/models` and `DELETE /api/ai/models` also require `expectedUpdatedAt`
from the displayed model's `GET /api/ai/models` response. PUT includes the complete
validated model fields; DELETE still requires `confirmation: "SİL"`.
Missing, invalid or stale versions return 409. Both operations condition their
write on the exact version and `draft` status, so concurrent edits and lifecycle
changes cannot be overwritten or deleted. Successful edits advance the timestamp
monotonically, including when the previous timestamp is ahead of the local clock.

The native editor preserves entered fields after a conflict or ambiguous write,
blocks resubmission of that stale revision, and reloads the list. Reopen the current
record with **Düzenle** to review its latest values. Network failures release busy
state; writes are not automatically retried.

## Atomic persistence and audit

Model creation, draft editing/deletion, approval and suspension each use a single
D1 batch for the model write and activity event. The audit INSERT is conditional
on the immediately preceding write changing exactly one row. Conflicts emit no
success event. An audit failure rolls back the model write, including deletion,
and the API returns a structured 503 for the existing UI recovery path.

Events preserve their existing names and details and additionally carry the
model ID in `context_refs_json`. Successful API response shapes, Admin role,
confirmation strings and critical-risk policy are unchanged. No migration is
required. This does not add request idempotency: after an ambiguous network
result, users should inspect the refreshed list before manually retrying creation.

Tests inject audit failures for every operation and verify unchanged model data,
version and approval metadata. Isolated API/browser QA covers full rollback and
recovery from a failed approval. Production deployment is not asserted.
