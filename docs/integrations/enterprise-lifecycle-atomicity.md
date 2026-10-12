# Incident and continuity decision integrity

Incident transitions, continuity plan approval/activation/retirement, exercise completion and gap closure now commit their state change and event together in a D1 batch. Conditional writes compare the server-read record before changing it. Competing decisions, reassignment or changed inputs return 409 without dependent writes. Incident and plan timestamps advance monotonically.

Exercise completion claims the planned exercise exactly once and checks the parent is still active with the same recovery objectives, ownership, reviewer, criticality and timestamp. Completion, an automatically required gap and its event commit together or roll back together. A passing exercise without target breaches produces no gap. Completing an exercise against a retired plan is rejected.

The clients reload after conflicts/server failures and ambiguous transport outcomes and dismiss stale decision dialogs. They do not replay a mutation automatically. On a failed reload users must refresh before making another decision.

Scope: this protects the server read/write interval, not a client-supplied version of an old screen. Record creation, exercise scheduling, other enterprise workflows, relationship validation and idempotency across ambiguous creates remain separate work. No schema migration or broader permission is introduced. Existing maker/checker checks remain authoritative.

Validation: the actual route handlers and SQL run against transactional SQLite in `tests/enterprise-lifecycle-atomicity.test.ts`, with only platform/auth adapters replaced. Cases cover replay, parent retirement/changed objectives, ownership races, competing decisions, successful/no-gap completion and rollback when gap or event inserts fail. This is not live browser or vendor integration validation.

## Policy and third-party decisions

Policy exception submission/approval/rejection/closure now compare the complete server-read exception and append their event atomically. Personal attestations also claim the pending assigned row, open campaign and exact content hash; a competing signature, reassignment, campaign closure or changed content returns 409 without a misleading success event.

Third-party assessment submission and decisions atomically update the assessment, profile and event. Claims recheck the profile status, version, risk owner and reviewer. Full approval rechecks blocking high/critical findings inside the write transaction. Offboarded/rejected profiles cannot be revived by these actions. Finding transitions compare the finding snapshot and current profile reviewer, and commit evidence and audit together.

Policy and vendor decision dialogs reconcile after conflicts and uncertain transport outcomes. This does not add client-version tokens, automatic mutation replay or idempotency keys. Vendor onboarding/renewal/offboarding and other creation paths still require separate work. Policy publication and campaign creation are covered by the later increment below. Existing role and maker/checker rules are preserved.

`tests/policy-vendor-decision-integrity.test.ts` executes the actual handlers and SQL with concurrent mutation hooks and injected write failures. It covers attestation, exception, assessment and finding decisions, including successful approval/submission/conditional/reject outcomes, duplicate requests, profile changes, new blocking findings, and rollback of assessment/profile/event writes. The shared SQLite adapter is in `tests/helpers/enterprise-route-fixture.ts`.

## Risk appetite and regulatory decisions

Risk appetite decisions, breach response planning/transitions, scenario submission/verification and board snapshot approval now compare the server-read snapshot and write their event in the same transaction. Retirement rechecks open breaches inside its claim. Board approval binds the verified JSON/hash and reviewer, preventing a concurrent content change from being approved.

KRI measurement now claims the approved appetite and its evaluated thresholds first, then inserts the measurement, any required breach and the audit event atomically. A changed/retired appetite conflicts. This does not make repeated independent submissions idempotent; measurement request keys remain separate work.

Regulatory change decisions recheck open/absent impacts at write time. Impact creation claims its parent, so a stale request cannot reopen a closed change. Impact transitions claim the impact and parent authorization snapshot, derive the parent state from current child rows inside the transaction, and append an event. Parent/event write failures roll back child changes. These changes do not validate target references or implement automatic source collection.

Risk and regulatory clients reconcile rejected/uncertain decisions. Regulatory transport failures now also release the busy state in a finally block. Source creation/review, initial change intake, risk statement editing/creation and scenario/board generation remain outside this transaction increment.

Validation: `tests/risk-regulatory-decision-integrity.test.ts` executes actual route SQL for competing updates, changed reviewers, late blocking children, closed parents, changed KRI thresholds, altered board content and rollback on child/parent/event failures. Existing lifecycle/domain tests remain applicable. These tests are isolated and do not imply live customer acceptance.


## Policy publication and retirement

Version submission/approval/rejection/publication now claim the exact version and document authorization snapshot. Publication commits the new version, supersedes old published versions, updates the current-version pointer and review date, and appends its event together. An operation-specific event ID gates multi-row dependent updates without relying on their affected-row counts. Competing publication, retirement, reviewer reassignment or content changes conflict.

Retirement claims the document and rechecks active exceptions/open campaigns in the same transaction. Campaign and exception creation recheck the current published version and document inside their insert, preventing a stale request from creating obligations after retirement. Campaign recipients and its event commit together. Exception approval also requires an unexpired exception linked to the current published policy.

`tests/policy-publication-integrity.test.ts` covers rollback at every publication stage, lifecycle decisions, competing parent changes, retirement blockers, campaign recipient/event failures and expired/superseded exception approvals. Initial policy creation, metadata editing and draft-version creation remain separate work. No client-version token or broad permission change is introduced.
