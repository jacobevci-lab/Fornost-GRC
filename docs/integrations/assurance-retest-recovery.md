# Reliable re-test recovery and risk reconciliation

The existing Connected GRC → Assurance work queue now opens the exact result of a governed re-test. The result explains whether evidence was usable, whether the linked risk was updated, and which open automation finding needs follow-up. It links back to the risk and related finding and reuses the control-run diagnostic view. Legacy completed work without a reconciliation summary still opens its original run without inventing an outcome.

## Recovery workflow

1. A normal re-test requires verified remediation and closure evidence. An inconclusive/error result or stale evidence can be queued again; a genuinely failed control must be remediated first.
2. Requesting another test creates a new pending-review work item. It never approves or runs the test automatically. Existing active work is reused.
3. An independent Admin approves. The API rechecks the finding/rule/target-control relationship and closure prerequisites at approval time. The maker cannot approve their own request; stale approval/rejection attempts return conflict.
4. The first completed run timestamp after approval is selected, with insertion order as the deterministic tie-break. A later pass cannot replace an earlier failed or errored re-test. Future-dated runs are not consumed.
5. A pass needs its own available evidence, matching response-hash metadata, passing validation status, matching collection timestamp and fresh/unexpired evidence. Missing, mismatched or stale evidence produces an explicit re-test error, not recovery. Metadata matching does not itself provide external certification or cryptographic proof of an upstream system.
6. A normal pass cannot certify remediation that has since reopened or lost closure proof. Mandatory exception expiry/revocation re-tests retain their explicit governed exception path, which may test an open finding.

## Persistence and concurrency

Reconciliation updates the work outcome, linked risk and any necessary finding reopen in one database batch transaction. A database write failure leaves the work awaiting re-test reconciliation. It can retry without pretending the linked risk was updated.

A unique per-attempt claim and compare-and-swap guards protect work status, source, evidence and risk snapshots. Concurrent processing cannot apply the same outcome twice. A risk edit or evidence deletion between read and commit defers the transaction; the next reconciliation reads the current data. Database failures propagate rather than being silently swallowed.

A failed control execution may already have opened the next automation finding cycle. Reconciliation links that open finding instead of violating the one-open-finding-per-rule index by reopening the old record. If there is no open finding, the original closed finding is reopened once. A later verified closure is not undone by an older run. Enterprise CAPA records remain under their existing independent closure workflow.

## Risk review

- Existing valid residual ratings are preserved after a passing test; passing automation never supplies an independent risk approval.
- A pending risk review, its original aging timestamp and escalation state stay pending until the human review workflow resolves them.
- Failed re-tests return the assessed exposure to the inherent baseline. Errors preserve ratings and require review.
- Likelihood/impact inputs must be integer ratings from 1 to 5. An aggregate calculated score is not treated as an impact rating; invalid/missing inherent dimensions use the existing fallback of 4, while invalid residual dimensions require review.
- A risk assessment newer than the consumed test is preserved and reported as such. Its business disposition, owner and treatment are not overwritten.
- Missing/invalid risk data or missing source linkage is visible as a re-test error. Unrelated risk data is not modified.
- Normal queued work stores the canonical linked risk ID. Mandatory exception work resolves its risk reference when queued. Older work without a risk reference keeps the existing finding-ID linkage convention; historical aliases are not guessed during reconciliation.

## Queue usability

Results, refresh and request-new-test actions live in the existing queue. Connection errors show a retry message instead of an empty successful queue. Viewer users do not receive write actions; scoped users retain the existing closed API boundary. The maker's approval buttons are hidden, while server enforcement remains authoritative. Show more reaches the remaining rows in the server's bounded 500-item window rather than stopping permanently at 25.

## Verification

`tests/assurance-retest-runtime.test.ts` uses real SQLite transactions, the actual collector orchestration with substituted HTTP, and production reconciliation. It covers success, error, failed/new cycles, reopening, concurrent workers, transaction rollback/retry, concurrent human edits, evidence deletion, malformed/missing/stale proof, approval ordering, newer risk/closure preservation, normal versus mandatory workflows, and retry eligibility.

`scripts/assurance-retest-runtime-qa.mjs` uses fixed localhost and explicit local D1 fixtures. It exercises actual HTTP reconciliation, the result dialog, retry queueing, maker-checker and approval revalidation, fresh proof, pending risk-review preservation, pagination, error recovery and both themes at desktop/mobile widths. Existing regression, layout, lifecycle, accessibility/localization and on-prem gates continue to run. No live customer or real vendor credential verification is claimed.
