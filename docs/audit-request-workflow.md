# Audit evidence requests and review

The audit workspace now includes structured evidence requests alongside its existing plan and requirement register. A request records its acceptance criteria, owner, independent reviewer, delivery date, review date and optional evidence period. Draft requests stay out of My Work and do not generate email. Starting the work plan previews the draft count, owner count and IANA time zone, checks the saved plan revision and activates the requests atomically. Milestone prose is not parsed into invented tasks.

An assigned owner submits 1–10 existing evidence versions. Only the designated reviewer can accept or return the submission; even an Admin cannot substitute for that reviewer. Return requires a reason and explicit delivery/review dates. Acceptance and cancellation are terminal in this increment. Submitted evidence is pinned by version ID and metadata; uploading a newer library version does not replace it. Request acceptance is distinct from global evidence approval, control readiness and the audit opinion. Period/content adequacy remains an explicit human review: this increment does not infer it from the file.

Editing a submitted request stops its current review and returns it to awaiting submission. The owner must submit again against the changed criteria or assignments; an old review cannot silently approve a changed request. Previous submissions remain in the activity history.

The existing Evidence Library supplies uploads. The request panel selects versions and opens their authenticated files; it does not add another upload endpoint. Audit read access does not grant evidence access: the API redacts evidence details unless the actor can read the Evidence module. Both assignees must be active mapped Admin/Editor accounts with audit write and evidence read access. Existing installation-local module boundaries remain authoritative; this is not a new external auditor permission model.

## Persistence and concurrency

Migration `0085_audit_request_workflow.sql` and `db/core-grc-schema.ts` define the workflow, request and append-only application event tables. The idempotent runtime initializer supports persisted on-prem installs. Every write checks the live audit and expected revision. Request mutation, event append and cancellation of queued reminders are one database batch. Start uses one guarded workflow insertion and activates the latest draft contents in the same transaction. Duplicate start/create or stale writes return 409 without duplicate tasks or events. This is an application activity trail, not tamper-proof storage.

Limits: 500 requests per audit, 1,000 work-queue rows, 5,000 active reminder sources, 500 latest evidence choices and the latest 200 activity events in the panel. Evidence choices and event truncation are disclosed; incomplete work/read lists cannot silently certify completeness. Source identities are exact email matches. Removed audits are no longer readable and stop generating work/reminders. Retained child rows are not reused by a new audit ID.

## My Work and reminders

Active requests appear in the existing My Work queue and open the exact parent audit/request. Submission moves the active reviewer and due date to the review clock while the owner's item is waiting for others. Accepted/cancelled work uses the actual updated timestamp. Calendar-day due times are converted using the workflow's IANA time zone, including DST; the review period itself is unchanged.

The existing Continuous Assurance outbox, transport, recipient throttling, leases, retry budget and scheduler are reused. A separate `audit-request` publisher emits assignment, one-day-before, due-day and three-days-overdue milestones. After downtime only the currently applicable milestone is enqueued. The fingerprint includes request ID, revision and milestone. Existing assurance reconciliation does not cancel this publisher's rows. Before sending, the dispatcher rereads the outbox and verifies live request state, revision, current recipient and active account/module grants. Email contains task references and navigation instructions, not evidence or sensitive request content. No new SMTP transport is introduced.

The request mutation queues notifications but does not send email itself. If reconciliation fails after a successful save, the response explicitly reports pending reminders; the scheduled pass retries. Delivery still requires configured email and a running scheduler. Transport acceptance does not prove reading. As with the existing transport, an ambiguous external acknowledgement is not a guarantee of exactly-once delivery.

## Deliberate next increments

This first work-plan launch permits adding requests before activation; post-launch additions need a governed plan revision flow. Business-day/holiday calendars, vacation delegation, custom escalation profiles, digesting, absolute deep links in email, closed-audit snapshots, attachment retention controls and broader file formats remain separate work. The first version does not freeze a whole audit or automatically re-open accepted requests when general library content changes.

## Verification

SQLite-backed lifecycle tests exercise silent drafts, repeat start, plan drift, stale/cross-parent writes, exact ownership, independent review, pinned versions, return/resubmit, terminal states, notification deduplication, reassignment, publisher isolation, scoped access, DST deadlines and rollback on event-write failure. All 38 focused tests and the complete 1,243-test suite passed, alongside type checking, targeted lint, production build and migration validation.

The isolated browser QA passed against real local APIs with three accounts: draft creation, launch, submission, return, resubmission, acceptance, duplicate protection and My Work navigation. Turkish and English views were checked at 390px and 1536px in both themes, with no panel overflow or page JavaScript errors. The CI workflow runs the same script and retains its screenshots. Live customer email/SSO delivery is not implied by these checks.
