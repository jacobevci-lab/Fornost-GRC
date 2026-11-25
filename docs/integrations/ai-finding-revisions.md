# Versioned AI finding transitions

`PATCH /api/ai/findings` requires `expectedUpdatedAt` copied from the displayed
record's `updatedAt`. This applies to start, submit, resolve and reopen. The native
UI captures that version when opening an action. Missing/stale versions return
409 and the UI reloads the record before allowing a new decision.

The write condition checks the reviewed revision, source identity, status, submitter and evidence snapshot. A change
between authorization and writing therefore cannot silently replace a newer
status or verification evidence. Successful transitions advance the version
monotonically. Existing action confirmations, evidence requirements and Admin-only
resolve/reopen rules remain in place. Self-verification checks normalize email
case and surrounding whitespace.

Tests cover independent-account submission/verification/reopen, stale API and UI
requests, and concurrent revision/status/submitter changes. No schema migration is
needed.

Creation and all four lifecycle decisions now commit together with their audit
event in one D1 batch transaction. Audit failure rolls back the finding, its
status, evidence and version. Conditional writes gate dependent audit insertion;
stale requests create no audit success event. Transaction errors return a
structured 503 and the existing UI reloads without automatically repeating the
mutation.

Creation checks the active model and source uniqueness in the INSERT itself.
Missing/retired models and existing unresolved source findings return 409. Reopen
also checks source uniqueness at write time, closing the race after the initial
route check. Resolution still requires an independent Admin; atomic persistence
does not change these authorization rules. A resolved source can have a new
finding; it cannot simultaneously be reopened while another one is unresolved.

SQLite tests inject audit failures at creation and every transition. Isolated
API/browser QA verifies rollback, preserved evidence, duplicate prevention and
recovery from a failed closure. Production deployment is not asserted.
