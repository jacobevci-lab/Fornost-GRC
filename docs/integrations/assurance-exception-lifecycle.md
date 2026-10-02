# Assurance exception lifecycle integrity

Exception review, revocation and expiration now commit the exception decision, mandatory re-test link and linked risk update in one D1 transaction. A private, unique claim token prevents a losing concurrent request from executing side effects, including requests from the same actor at the same timestamp. The token is not returned by the governance API.

The transaction checks the full exception snapshot and, when linked, the risk's JSON and timestamp. A concurrent change returns HTTP 409 without overwriting the new state. The operator refreshes and retries. Storage failures roll back the complete transaction; a retry can succeed after the failure is resolved. Approving an exception preserves assurance state and residual ratings.

Only independent Admin reviewers can approve, reject or revoke. The author comparison trims whitespace and ignores case. Rejection and revocation require a reason. An expired pending request cannot be approved. Missing linked risks block approval; rejection remains available. Exceptions without an automated finding/rule retain the explicit manual re-test requirement when ended.

Expiration is inclusive of its final UTC date. Governance reads reconcile up to 200 expired active exceptions. A conflicting record stays eligible for the next refresh. If expired active records remain in the response, data quality is incomplete and the existing UI masks aggregate metrics and disables mutations rather than presenting a healthy queue. Database failures propagate instead of being counted as completed.

Outstanding re-tests are reused only for the same finding AND rule. Ending an older exception does not overwrite another exception's risk summary. It still requires risk-owner reassessment and preserves the original review-request date. The exception list is the authoritative multi-exception history; risk fields remain a summary.

The existing runtime schema upgrade adds `lifecycle_token TEXT NOT NULL DEFAULT ''` to legacy exception tables and tolerates concurrent cold-start upgrades. No historic rows are removed. This does not introduce a background scheduler or change the existing re-test completion policy.

Verification: real SQLite functional tests cover competing decisions, concurrent edits, rollback at both task and risk writes, retries, expiry boundaries, duplicate reconciliation, shared tasks, manual cases and overlapping exception summaries. The isolated local-D1 browser/API suite checks authorization, transaction failure/recovery, expiry, task linkage and rendering. Fixtures and intentional write-failure triggers are restricted to loopback/local D1 and cleaned up afterward.
