# Audit evidence requests and review

The audit workspace now includes structured evidence requests alongside its existing plan and requirement register. A request records its acceptance criteria, owner, independent reviewer, delivery date, review date and optional evidence period. Draft requests stay out of My Work and do not generate email. Starting the work plan previews each draft’s owner, reviewer, deadlines, evidence period and acceptance criteria alongside the IANA time zone. It checks the exact draft IDs/revisions and saved plan revision and activates those requests atomically. Milestone prose is not parsed into invented tasks.

An assigned owner submits 1–10 existing evidence versions. Only the designated reviewer can accept or return the submission; even an Admin cannot substitute for that reviewer. Return requires a reason and explicit delivery/review dates. Acceptance and cancellation are terminal in this increment. Submitted evidence is pinned by version ID and metadata; uploading a newer library version does not replace it. Request acceptance is distinct from global evidence approval, control readiness and the audit opinion. Period/content adequacy remains an explicit human review: this increment does not infer it from the file.

Editing a submitted request stops its current review and returns it to awaiting submission. The owner must submit again against the changed criteria or assignments; an old review cannot silently approve a changed request. Previous submissions remain in the activity history.

The existing Evidence Library supplies uploads. The request panel selects versions and opens their authenticated files; it does not add another upload endpoint. Audit read access does not grant evidence access: the API redacts evidence details unless the actor can read the Evidence module. Both assignees must be active mapped Admin/Editor accounts with audit write and evidence read access. Existing installation-local module boundaries remain authoritative; this is not a new external auditor permission model.

## Additional requests after launch

An active audit can receive additional requests without restarting its existing work plan. Creating one requires the current workflow revision and leaves it as a silent draft. Use **Review additions** to see every pending draft, then enter a reason of 5–2,000 characters and activate the batch. Existing assigned/submitted requests and accepted evidence decisions are untouched; the original time zone is retained. A cancelled draft that was never activated does not appear as completed work.

Activation records the reason, actor, plan revision and new workflow revision alongside each request snapshot in the activity history. The plan revision identifies the saved scope acknowledged for this addition; it is not a whole-audit closure snapshot or immutable copy of the complete plan. No new independent approval role is implied: activation uses the existing audit write permission; evidence acceptance still requires the assigned independent reviewer.

The preview is exact for both initial launch and later additions. Concurrent creation, edit or cancellation of a draft, a saved plan change, or a changed assignee account/grant invalidates activation. Workflow claim, draft assignment and activity entries commit in one transaction. A stale/repeated activation returns 409 without partially assigning requests or generating duplicate events. Reload and review the current preview before retrying. Request creation also checks the workflow revision inside the write, so a concurrent activation cannot silently include a new unreviewed draft. The bounded JSON preview supports the existing 500-request limit without one SQL parameter per request.

## Request completion summary

The request panel now separates drafts, awaiting delivery, changes requested, awaiting review, accepted and cancelled requests. Each count filters the full loaded request set; the outstanding filter includes staged drafts and clears unrelated search text. A local-calendar overdue filter uses the workflow time zone and the active owner's delivery date or reviewer's review date. Drafts and terminal decisions are never overdue. The display refreshes its clock every minute. Invalid clocks or dates disclose an unavailable overdue count.

“No outstanding requests” means every request in a complete, active work plan is accepted or cancelled. Cancellation remains separate from acceptance. Empty, unstarted, incomplete or stale reads never claim resolved work. This is a request-progress summary, not whole-audit closure, findings resolution or an audit opinion. Existing decisions and permissions are unchanged.

## Persistence and concurrency

Migration `0085_audit_request_workflow.sql` and `db/core-grc-schema.ts` define the workflow, request and append-only application event tables. The idempotent runtime initializer supports persisted on-prem installs. Every write checks the live audit and expected revision. Request mutation, event append and cancellation of queued reminders are one database batch. Start uses one guarded workflow insertion and activates only the exact reviewed draft revisions in the same transaction. Subsequent activation claims the current workflow revision, with transactional draft/plan and assignee permission checks. Duplicate start/create or stale writes return 409 without duplicate tasks or events. This is an application activity trail, not tamper-proof storage.

Limits: 500 requests per audit, 1,000 work-queue rows, 5,000 active reminder sources, 500 latest evidence choices and the latest 200 activity events in the panel. Evidence choices and event truncation are disclosed; incomplete work/read lists cannot silently certify completeness. Source identities are exact email matches. Removed audits are no longer readable and stop generating work/reminders. Retained child rows are not reused by a new audit ID.

## My Work and reminders

Active requests appear in the existing My Work queue and open the exact parent audit/request. Submission moves the active reviewer and due date to the review clock while the owner's item is waiting for others. Accepted/cancelled work uses the actual updated timestamp. Calendar-day due times are converted using the workflow's IANA time zone, including DST; the review period itself is unchanged.

The existing Continuous Assurance outbox, transport, recipient throttling, leases, retry budget and scheduler are reused. A separate `audit-request` publisher emits assignment, one-day-before, due-day and three-days-overdue milestones. After downtime only the currently applicable milestone is enqueued. The fingerprint includes request ID, revision and milestone. Existing assurance reconciliation does not cancel this publisher's rows. Before sending, the dispatcher rereads the outbox and verifies live request state, revision, current recipient and active account/module grants. Email contains task references and navigation instructions, not evidence or sensitive request content. No new SMTP transport is introduced.

The request mutation queues notifications but does not send email itself. If reconciliation fails after a successful save, the response explicitly reports pending reminders; the scheduled pass retries. Delivery still requires configured email and a running scheduler. Transport acceptance does not prove reading. As with the existing transport, an ambiguous external acknowledgement is not a guarantee of exactly-once delivery.

## Deliberate next increments

Business-day/holiday calendars, vacation delegation, custom escalation profiles, digesting, absolute deep links in email, closed-audit snapshots, attachment retention controls remain separate work. Shared upload validation now supports PDF, raster images, UTF-8 CSV/TSV/TXT/LOG/JSON and supported DOCX/XLSX containers. The first version does not freeze a whole audit or automatically re-open accepted requests when general library content changes.

## Verification

SQLite-backed lifecycle tests exercise silent drafts, repeat start, plan drift, stale/cross-parent writes, exact ownership, independent review, pinned versions, return/resubmit, terminal states, notification deduplication, reassignment, publisher isolation, scoped access, DST deadlines and rollback on event-write failure. The initial increment passed 38 focused tests and the complete 1,243-test suite, alongside type checking, targeted lint, production build and migration validation. Additional-request tests cover silent staging, reasoned activation, duplicate/conflicting previews, transactional races, rollback, unchanged acceptance decisions, reminder isolation and cancelled unpublished drafts. The browser QA also exercises stale-preview recovery and additional-request activation.

The isolated browser QA passed against real local APIs with three accounts: draft creation, launch, submission, return, resubmission, acceptance, duplicate protection and My Work navigation. Turkish and English views were checked at 390px and 1536px in both themes, with no panel overflow or page JavaScript errors. The CI workflow runs the same script and retains its screenshots. Live customer email/SSO delivery is not implied by these checks.
