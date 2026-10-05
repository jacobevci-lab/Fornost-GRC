# Versioned, atomic AI assurance alert decisions

GET `/api/ai/assurance-alerts` (including `?id=...`) returns an opaque `revision` per alert. PATCH requires that displayed value as `expectedRevision`, alongside the existing action, owner, note and confirmation. Admin authorization and existing transition rules remain unchanged. API clients must adopt this required field; missing or stale revisions receive 409.

The revision hashes a fixed snapshot of the alert's identity, measurements and decision fields. A new observation also invalidates an old decision: users must review the current measurement. It is not an authorization token. No schema migration is required. Decision timestamps advance monotonically, including reopen cycles within the same millisecond.

A conditional update claims exactly the snapshot read by the server. D1 batch then creates the escalation finding (when requested) and appends the audit event in the same transaction. Dependent writes require `changes()=1` from the preceding statement. Concurrent changes produce no finding or audit. SQL errors roll back every write; the UI reloads after conflicts, server failures or ambiguous network results and never retries a mutation automatically.

An existing CAPA link is preserved through resolve/reopen; a second escalation cannot silently replace it. An unresolved finding for the same source also blocks a new claim. Alarm resolution does not resolve its linked finding: the finding's existing independent verification workflow still applies.

Validation includes real SQLite concurrency and rollback tests, plus isolated authenticated API/browser QA for audit failure rollback, a stale dialog, successful escalation and replay rejection. These checks do not assert production deployment. Measurement synchronization remains a separate operation; this change makes human lifecycle decisions atomic, not an entire measurement scan.
