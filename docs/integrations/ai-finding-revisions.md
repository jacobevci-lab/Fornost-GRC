# Versioned AI finding transitions

`PATCH /api/ai/findings` requires `expectedUpdatedAt` copied from the displayed
record's `updatedAt`. This applies to start, submit, resolve and reopen. The native
UI captures that version when opening an action. Missing/stale versions return
409 and the UI reloads the record before allowing a new decision.

The write condition checks the reviewed revision, status and submitter. A change
between authorization and writing therefore cannot silently replace a newer
status or verification evidence. Successful transitions advance the version
monotonically. Existing action confirmations, evidence requirements and Admin-only
resolve/reopen rules remain in place. Self-verification checks normalize email
case and surrounding whitespace.

Tests cover independent-account submission/verification/reopen, stale API and UI
requests, and concurrent revision/status/submitter changes. No schema migration is
needed. Audit events still use the existing separate write after a successful
transition; this change does not make audit logging transactional.
