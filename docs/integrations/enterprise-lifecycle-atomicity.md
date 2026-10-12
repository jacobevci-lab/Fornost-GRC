# Incident and continuity decision integrity

Incident transitions, continuity plan approval/activation/retirement, exercise completion and gap closure now commit their state change and event together in a D1 batch. Conditional writes compare the server-read record before changing it. Competing decisions, reassignment or changed inputs return 409 without dependent writes. Incident and plan timestamps advance monotonically.

Exercise completion claims the planned exercise exactly once and checks the parent is still active with the same recovery objectives, ownership, reviewer, criticality and timestamp. Completion, an automatically required gap and its event commit together or roll back together. A passing exercise without target breaches produces no gap. Completing an exercise against a retired plan is rejected.

The clients reload after conflicts/server failures and ambiguous transport outcomes and dismiss stale decision dialogs. They do not replay a mutation automatically. On a failed reload users must refresh before making another decision.

Scope: this protects the server read/write interval, not a client-supplied version of an old screen. Record creation, exercise scheduling, other enterprise workflows, relationship validation and idempotency across ambiguous creates remain separate work. No schema migration or broader permission is introduced. Existing maker/checker checks remain authoritative.

Validation: the actual route handlers and SQL run against transactional SQLite in `tests/enterprise-lifecycle-atomicity.test.ts`, with only platform/auth adapters replaced. Cases cover replay, parent retirement/changed objectives, ownership races, competing decisions, successful/no-gap completion and rollback when gap or event inserts fail. This is not live browser or vendor integration validation.
