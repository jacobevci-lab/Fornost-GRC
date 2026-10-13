# Incident and continuity decision integrity

Incident transitions, continuity plan approval/activation/retirement, exercise completion and gap closure now commit their state change and event together in a D1 batch. Conditional writes compare the server-read record before changing it. Competing decisions, reassignment or changed inputs return 409 without dependent writes. Incident and plan timestamps advance monotonically.

Exercise completion claims the planned exercise exactly once and checks the parent is still active with the same recovery objectives, ownership, reviewer, criticality and timestamp. Completion, an automatically required gap and its event commit together or roll back together. A passing exercise without target breaches produces no gap. Completing an exercise against a retired plan is rejected.

The clients reload after conflicts/server failures and ambiguous transport outcomes and dismiss stale decision dialogs. They do not replay a mutation automatically. On a failed reload users must refresh before making another decision.

Scope: this protects the server read/write interval, not a client-supplied version of an old screen. Record creation and exercise scheduling are covered by the later intake increment below. Other enterprise workflows, relationship validation and idempotency across ambiguous creates remain separate work. No schema migration or broader permission is introduced. Existing maker/checker checks remain authoritative.

Validation: the actual route handlers and SQL run against transactional SQLite in `tests/enterprise-lifecycle-atomicity.test.ts`, with only platform/auth adapters replaced. Cases cover replay, parent retirement/changed objectives, ownership races, competing decisions, successful/no-gap completion and rollback when gap or event inserts fail. This is not live browser or vendor integration validation.

## Policy and third-party decisions

Policy exception submission/approval/rejection/closure now compare the complete server-read exception and append their event atomically. Personal attestations also claim the pending assigned row, open campaign and exact content hash; a competing signature, reassignment, campaign closure or changed content returns 409 without a misleading success event.

Third-party assessment submission and decisions atomically update the assessment, profile and event. Claims recheck the profile status, version, risk owner and reviewer. Full approval rechecks blocking high/critical findings inside the write transaction. Offboarded/rejected profiles cannot be revived by these actions. Finding transitions compare the finding snapshot and current profile reviewer, and commit evidence and audit together.

Policy and vendor decision dialogs reconcile after conflicts and uncertain transport outcomes. This does not add client-version tokens, automatic mutation replay or idempotency keys. Vendor onboarding, renewal, finding creation and offboarding are covered by the later increment below; other creation paths remain separate work. Policy publication and campaign creation are covered by the later increment below. Existing role and maker/checker rules are preserved.

`tests/policy-vendor-decision-integrity.test.ts` executes the actual handlers and SQL with concurrent mutation hooks and injected write failures. It covers attestation, exception, assessment and finding decisions, including successful approval/submission/conditional/reject outcomes, duplicate requests, profile changes, new blocking findings, and rollback of assessment/profile/event writes. The shared SQLite adapter is in `tests/helpers/enterprise-route-fixture.ts`.

## Risk appetite and regulatory decisions

Risk appetite decisions, breach response planning/transitions, scenario submission/verification and board snapshot approval now compare the server-read snapshot and write their event in the same transaction. Retirement rechecks open breaches inside its claim. Board approval binds the verified JSON/hash and reviewer, preventing a concurrent content change from being approved.

KRI measurement now claims the approved appetite and its evaluated thresholds first, then inserts the measurement, any required breach and the audit event atomically. A changed/retired appetite conflicts. This does not make repeated independent submissions idempotent; measurement request keys remain separate work.

Regulatory change decisions recheck open/absent impacts at write time. Impact creation claims its parent, so a stale request cannot reopen a closed change. Impact transitions claim the impact and parent authorization snapshot, derive the parent state from current child rows inside the transaction, and append an event. Parent/event write failures roll back child changes. These changes do not validate target references or implement automatic source collection.

Risk and regulatory clients reconcile rejected/uncertain decisions. Regulatory transport failures now also release the busy state in a finally block. Source creation/review, initial change intake, risk statement editing/creation and scenario/board generation are covered by the later intake increment below.

Validation: `tests/risk-regulatory-decision-integrity.test.ts` executes actual route SQL for competing updates, changed reviewers, late blocking children, closed parents, changed KRI thresholds, altered board content and rollback on child/parent/event failures. Existing lifecycle/domain tests remain applicable. These tests are isolated and do not imply live customer acceptance.


## Policy publication and retirement

Version submission/approval/rejection/publication now claim the exact version and document authorization snapshot. Publication commits the new version, supersedes old published versions, updates the current-version pointer and review date, and appends its event together. An operation-specific event ID gates multi-row dependent updates without relying on their affected-row counts. Competing publication, retirement, reviewer reassignment or content changes conflict.

Retirement claims the document and rechecks active exceptions/open campaigns in the same transaction. Campaign and exception creation recheck the current published version and document inside their insert, preventing a stale request from creating obligations after retirement. Campaign recipients and its event commit together. Exception approval also requires an unexpired exception linked to the current published policy.

`tests/policy-publication-integrity.test.ts` covers rollback at every publication stage, lifecycle decisions, competing parent changes, retirement blockers, campaign recipient/event failures and expired/superseded exception approvals. Initial policy creation, metadata editing and draft-version creation are covered by the later increment below. No client-version token or broad permission change is introduced.


## Third-party onboarding, renewal and exit

Supplier onboarding and adoption commit the source record, TPRM profile, initial assessment and event together. Adoption claims the exact source snapshot; explicit missing IDs return 404 instead of silently creating another supplier. The name/service duplicate check is repeated inside the first write so a concurrent registration leaves no orphan source record.

Renewal claims the profile, rechecks unfinished assessments and the latest cycle number, creates the next cycle, records its event and supersedes prior decisions atomically. An operation-specific event marker gates supersession even when it affects zero or multiple rows. New findings claim the assessment and check the active parent; superseded assessments and concurrently offboarded suppliers cannot acquire new findings. Finding transitions also recheck parent status/version, preventing reopening after offboarding.

Offboarding claims the reviewer/profile snapshot, rechecks every open finding and the source supplier record, and commits both supplier views plus the evidence event together. Missing/changed source records conflict rather than leaving disagreeing supplier states. Existing roles and independent reviewer checks remain unchanged.

Validation: `tests/vendor-onboarding-integrity.test.ts` executes actual route SQL with late concurrent mutations and rollback failures at source/profile/assessment/finding/event writes. The helper now accepts an explicitly selected internal identity column for `vendor_id`-keyed profiles. No schema migration, client-version token, general reference validation, idempotency keys, or automatic retry is added. A legitimate finding added after a completed approval remains visible through critical-finding attention; it does not retroactively rewrite the recorded approval.


## Policy intake and draft creation

Policy creation and metadata updates commit their audit events with the record. Duplicate policy codes are checked inside the write, and edits claim the complete server-read document so retirement, reviewer changes or another edit cannot be overwritten during the read/write interval.

Draft creation claims the policy, rechecks the absence of an unfinished version and the latest version number, then commits the draft, content hash and event together. Concurrent retirement or creation conflicts without leaving a draft or advancing the parent timestamp. The published version pointer is preserved. Metadata updates retain existing permissions; this is not an additional approval workflow or a client-side stale-form token.

Validation: `tests/policy-creation-integrity.test.ts` covers successful and duplicate creation, concurrent metadata changes/retirement, version numbering conflicts, exact content hashing, pointer preservation, and rollback on version/event write failures.

Supplier and policy clients dismiss creation/edit dialogs as well as decision dialogs after 409/server errors or uncertain transport outcomes, then reload. Validation errors keep input available. Mutations are never automatically retried.


## Incident and continuity intake

Incident declaration and continuity plan creation now commit their initial records and history together. A failed event write rolls back the record instead of leaving an unaudited incident or plan.

Exercise scheduling claims the complete server-read active plan and advances its timestamp before inserting the exercise and event in one transaction. Retirement, deletion, reassignment or changed recovery targets between read and write return 409 without creating an exercise. Failure inserting either the exercise or history restores the original plan timestamp. Separate intentional scheduling requests remain supported; no deduplication or request-idempotency mechanism is claimed.

Incident and continuity clients dismiss creation/scheduling forms on conflicts, server errors and uncertain transport outcomes, then reload; validation failures keep entered input. Existing authorization is preserved. This does not introduce client-version tokens, validate referenced assets/BIA/risk records, prevent retirement of plans with previously scheduled exercises, or change gap-closure/retest requirements.

Validation: `tests/resilience-intake-integrity.test.ts` runs actual route handlers and transactional SQLite SQL for successful intake, rollback at record/event writes, inactive or missing parents, and concurrent retirement/deletion/target/reviewer changes. The fixture substitutes platform/auth adapters and does not replace the deployment QA gates.


## Risk and regulatory intake

Risk appetite creation and editing now commit history with the record. Editing claims the complete server-read draft/rejected statement, so concurrent approval, reassignment or threshold changes cannot be overwritten or reset to draft. Scenario intake claims the approved appetite and commits the scenario and its event together. Board generation commits the sealed snapshot and history atomically; its bounded portfolio reads are still not a single transactional portfolio snapshot.

Regulatory source creation and review commit their events atomically. Review rechecks the complete enabled source, including review cadence, before updating its schedule. Change intake claims the enabled source and rechecks the source/external-reference pair inside the write before creating the change and event. Ordinary database failures are no longer reported as duplicate-reference conflicts. This remains manual source review/intake, not an automated regulatory feed collector.

Risk and regulatory creation dialogs reconcile after conflicts and uncertain outcomes without automatically replaying writes. Validation errors preserve input. No permission expansion, schema migration, client-version tokens or request-idempotency keys are introduced; linked target validation and historical portfolio snapshot consistency remain separate work.

Validation: `tests/risk-regulatory-intake-integrity.test.ts` executes actual route handlers and SQL for create/update success, concurrent parent approval/retirement/threshold/cadence changes, duplicate source references, content hash preservation and rollback of records and timestamps when child/history writes fail. The shared fixture uses the actual URL validator for source creation.

### KRI period integrity

Measurement creation checks the entire period against the approved appetite's validity window. Historical measurements remain supported, including breach creation, but cannot replace the schedule established by a later measurement. The schedule decision and duplicate-period guard execute in the parent claim inside the same transaction as measurement, breach and audit inserts. A repeated period returns HTTP 409 without changing the existing record or adding history; it is not an idempotent success response. Concurrent parent changes still require refresh and retry. Existing historical schedule errors are not migrated automatically.

Regression coverage includes out-of-order red measurements after a newer green measurement, subsequent schedule advancement, repeated and racing periods, inclusive validity boundaries, and full rollback on a failed historical audit insert.

### Regulatory terminal decisions and reassessment

Changes close only from verification with at least one impact and no incomplete impacts. Not-applicable decisions are limited to triage or impact-assessment with no impacts. Only closed/not-applicable changes can reopen; reopening requires an Admin, exact confirmation and a reason of at least 10 characters.

Reopening resumes triage with undetermined applicability when no impacts exist, implementation when incomplete impacts remain, or verification when all impacts are complete. Previous decision events remain intact; current closure metadata and applicability rationale are cleared. The full parent snapshot and impact totals/open counts are rechecked in the transaction, and audit failure rolls back the entire reassessment. Repeated terminal decisions return 409 without new events. This does not implement client-side expected-version tokens or automatically repair older inconsistent records.

The detail view exposes reopening for terminal records and limits terminal-decision buttons to valid origins. Impact actions on a closed parent direct users to reopen the change first. Runtime QA exercises close, duplicate rejection, reopen, impact rework, independent re-verification and reclosure.
