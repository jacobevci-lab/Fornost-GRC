# Incident and continuity decision integrity

Incident transitions, continuity plan approval/activation/retirement, exercise completion and gap closure now commit their state change and event together in a D1 batch. Conditional writes compare the server-read record before changing it. Competing decisions, reassignment or changed inputs return 409 without dependent writes. Incident and plan timestamps advance monotonically.

Exercise completion claims the planned exercise exactly once and checks the parent is still active with the same recovery objectives, ownership, reviewer, criticality and timestamp. Completion, an automatically required gap and its event commit together or roll back together. A passing exercise without target breaches produces no gap. Completing an exercise against a retired plan is rejected.

The clients reload after conflicts/server failures and ambiguous transport outcomes and dismiss stale decision dialogs. They do not replay a mutation automatically. On a failed reload users must refresh before making another decision.

Scope: this protects the server read/write interval, not a client-supplied version of an old screen. Record creation, exercise scheduling, other enterprise workflows, relationship validation and idempotency across ambiguous creates remain separate work. No schema migration or broader permission is introduced. Existing maker/checker checks remain authoritative.

Validation: the actual route handlers and SQL run against transactional SQLite in `tests/enterprise-lifecycle-atomicity.test.ts`, with only platform/auth adapters replaced. Cases cover replay, parent retirement/changed objectives, ownership races, competing decisions, successful/no-gap completion and rollback when gap or event inserts fail. This is not live browser or vendor integration validation.

## Policy and third-party decisions

Policy exception submission/approval/rejection/closure now compare the complete server-read exception and append their event atomically. Personal attestations also claim the pending assigned row, open campaign and exact content hash; a competing signature, reassignment, campaign closure or changed content returns 409 without a misleading success event.

Third-party assessment submission and decisions atomically update the assessment, profile and event. Claims recheck the profile status, version, risk owner and reviewer. Full approval rechecks blocking high/critical findings inside the write transaction. Offboarded/rejected profiles cannot be revived by these actions. Finding transitions compare the finding snapshot and current profile reviewer, and commit evidence and audit together.

Policy and vendor decision dialogs reconcile after conflicts and uncertain transport outcomes. This does not add client-version tokens, automatic mutation replay or idempotency keys. Policy version publication/retirement, campaign creation, vendor onboarding/renewal/offboarding and other creation paths still require separate work; this increment does not claim those are atomic. Existing role and maker/checker rules are preserved.

`tests/policy-vendor-decision-integrity.test.ts` executes the actual handlers and SQL with concurrent mutation hooks and injected write failures. It covers attestation, exception, assessment and finding decisions, including successful approval/submission/conditional/reject outcomes, duplicate requests, profile changes, new blocking findings, and rollback of assessment/profile/event writes. The shared SQLite adapter is in `tests/helpers/enterprise-route-fixture.ts`.
