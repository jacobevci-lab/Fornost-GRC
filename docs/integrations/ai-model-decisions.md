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
model decision activity event; the activity write remains a separate operation.

On conflict, the UI dismisses the old confirmation and reloads the model. It does
not automatically reapply the decision to the newly loaded record. Network errors
also refresh before another attempt. This does not introduce new independent
approver requirements or change the separate decommission-plan transaction model.

Verification includes SQLite execution of the actual decision function, injected
read/write races, terminal-state and critical-risk checks, and isolated browser
QA using real model APIs. Browser QA opens a decision, changes the draft through
the API, verifies rejection and refresh, then explicitly approves the new version.
Retired fixtures reject both operations and retain their stored metadata.
