# Product research delivery status — 28 October 2026

This reconciles the ten delivery packages in the 14 October GRC product study with implementation through connected incident decisions, including whole-audit closure, workpapers, structured milestones, reusable views and canonical decision evidence across the delivered workflows. User-facing entry points are the [Product overview](PRODUCT-OVERVIEW.md), [User guide](USER-GUIDE.md) and [Admin guide](ADMIN-GUIDE.md). It is a scope inventory, not a claim that every research acceptance scenario or customer integration has passed. The user's latest direction is functional improvement within the existing theme.

| Research package | Implemented scope | Remaining scope |
| --- | --- | --- |
| P0: audit task chain | Silent request drafts; exact launch/addition preview; owner and independent reviewer; submission, return, resubmission and acceptance; exact My Work links; explicit owner/date/time-zone milestone tasks with history, report snapshots and closure blockers. | Bilingual plan/milestone draft starters and portable JSON text templates are implemented. Narrative milestones are not automatically parsed; the shared plan/task/task-pack library is delivered below; independent milestone sign-off is delivered below; background recurrence scheduling remains separate. |
| P0: reminder profiles | Existing outbox/transport reuse; assignment and due milestones; separate owner/reviewer dates; IANA time zone and stale-recipient checks; per-audit business-day calendars, manually defined holidays, configurable reminder thresholds and a single authorized escalation recipient; configured absolute audit-task links in email. | Automatic calendar propagation/holiday feeds, delegation, multi-level escalation/digest profiles and customer SMTP/Graph validation. Admin-managed shared calendar versions and explicit adoption are delivered below. |
| P0: evidence period and review | Version-pinned requests, acceptance criteria and dates; safe text/CSV/JSON preview; supported DOCX/XLSX uploads; independent version review. | Period/content adequacy remains human review. Full Office visual preview and automatic re-evaluation after general library changes are separate work. |
| P0: audit closure | Request-work-plan closure; whole-audit independent approval, return/withdrawal, SQL write locks, reasoned reopening, immutable plan/requirement/request/direct-CAPA package and verified JSON; pending My Work links. | Final opinion templates, independent sign-off of arbitrary status reports, attachment retention/bundles and broader finding-store scope. |
| P1: external auditor workspace | Existing authenticated internal access and module grants. | External, time-bound engagement/period/version grants with matching file and export enforcement. |
| P1: workpapers and sampling | Structured per-audit workpapers, population/source and selection rationale, up to 100 manually or reproducibly randomly selected test units with validated CSV entry, pinned evidence versions, owner submission, independent review/return, reasoned reopen/cancel, revision history and report/closure integration; owner preparation and reviewer handoff in My Work with exact workpaper navigation. | Confidence/sample-size calculations, stratified selection, unattended/bulk CAPA creation, separate per-sample sign-off and customer-scale benchmarking. Explicit approved-exception CAPA promotion is delivered below. |
| P1: control/finding lifecycle | Connected control/evidence/findings context, canonical CAPA, independent review/retest and exact navigation; [evidence usage workspace](evidence-usage.md) with bounded cross-module references and validated version pins; [explicit dated follow-up tasks](evidence-change-followups.md) for open requests/workpapers, with immutable origin and existing task/history/My Work/report/closure integration. | Automatic follow-up creation/re-evaluation, historical report/event usage and further module coverage remain open. The usage query stays read-only; task creation is a separate explicit action. |
| P1: enterprise operations evidence | On-prem packages, Docker/Podman compatibility, system/connector health and backup/recovery guidance. | Real customer SSO/mail/ticket UAT and an installation-specific restore exercise. CI is not customer UAT. |
| P2: scale and deep planning | Explicit bounded/incomplete reads; paginated register search and selected workspaces. | Risk-based annual planning, capacity allocation, advanced sampling and customer-scale benchmarking. |
| P2: reasoned AI assistance | Existing governed AI workspace and human-controlled model decisions. | Do not treat the entire proposed source-grounded review/mapping assistant or adversarial acceptance matrix as delivered by the recent UI/search increments. |

## Recent product-wide improvements

PR #314 added authorized search across eight core registers, exact-record navigation, per-user/module/tab query and filter memory, previous-view return and source-error retry. This is broader navigation/workflow work, not delivery of every research package. The earlier audit/control/evidence workspaces are documented separately.

Shared record links now cover eight core registers plus audit requests, workpapers and structured milestones, with authenticated exact-target resolution, access checks, local sign-in continuity and retry. See `docs/record-links.md`.

The email simplification keeps transport configuration and testing, delivery deadlines/retry policy and recipient frequency limits. It removes delivery/dispatch/recovery/deferral history, queue counters and manual operational actions from the Email & Notifications screen. It does not delete stored audit data or disable scheduled delivery.

## Implementation references

- `docs/audit-request-workflow.md` and `app/audit-request-notifications.ts`
- `docs/audit-engagement-planning.md` and `app/audit-plan.ts`
- `docs/audit-status-reports.md` and `docs/audit-closure.md`
- `docs/research-workspaces.md`
- `docs/integrations/control-assurance-workspace.md`
- `docs/integrations/capa-control-context.md`
- `docs/integrations/ai-model-decisions.md`
- `docs/record-search.md`

Per-audit calendars and single-recipient escalation are implemented; shared calendar versions and explicit adoption are delivered below; automatic propagation, delegation and multi-level/digest profiles remain separate work. Structured workpapers are delivered within the bounded manual/random selection scope above. External auditor access remains a separate package. The email-settings simplification did not itself deliver these capabilities.

- `docs/audit-reminder-profiles.md`

Structured plan milestones: [Audit milestones](audit-milestones.md). These tasks support optional independent milestone review, separate from evidence requests and workpapers.

Personal named register views now cover Risk, BIA, Assets, Compliance, Controls, Evidence and audit requirements. These reuse current authorized records; they are browser-local preferences, not server/team views or evidence snapshots. See [Saved register views](saved-register-views.md).

The adjacent account/team panel now adds server-backed personal views (20 per account/module) and Admin-published team views (50 per module) across those seven registers and My Work. It includes explicit criteria/destination previews, cross-device reuse, current module/owner/revision checks, guarded atomic changes and confirmed preference removal. Existing browser-local data remains intact and is copied only by explicit apply/save. My Work keeps the current Mine/Organization scope and hides shared criteria targeting inaccessible modules. Group-specific publication, automatic/default application, scheduled exports, personal history and independent publication approval remain open. Immutable team history and reasoned restore are delivered below. See [Account and team views](account-team-views.md).

My Work supports a module selector within the current authorized personal/organization scope. Summary counts, due/status filters, completed work, pagination and CSV exports share that selection. Empty module selections remain explicit; the separate assurance signals keep their own scope.

My Work also supports up to ten personal named browser-local views of search, module and work-status criteria. Applying uses current records, resets pagination and preserves current personal/organization scope. These are not team views or snapshots.

Milestone prerequisites now enforce same-audit sequencing, acyclic links and completion before start/complete. Whole-graph revision guards prevent concurrent bypass. My Work identifies blocked work; task history and audit snapshots retain prerequisite IDs. Automatic date rescheduling remains separate; explicit recurring periods are described below.


Milestone recurrence now supports explicit, owner/admin-created next occurrences after completion, with weekly/monthly/quarterly/yearly calendar rules, month-end anchors, previous/next navigation, one-successor protection, and atomic history/report provenance. This closes the manually controlled recurring-task workflow. Background scheduling, automatic catch-up and automatic business-day recurrence adjustment remain open; the shared library is described below.


Milestone email reminders are now opt-in per task, reuse the audit calendar, delivery retries/rate limits and configured email transport, and revalidate live task/profile/recipient access before dispatch. Queue withdrawal, exact authenticated links and reminder date previews are implemented. No additional log UI is introduced. Customer transport UAT, delegation, multi-level escalation/digests and background recurrence creation remain open.


Workpapers now support optional paired preparation/review deadlines and a per-paper IANA time zone. My Work follows the active lifecycle deadline, including return/reopen and terminal states; history and saved report/closure snapshots retain the schedule. Explicit business-day adjustment is delivered below; automatic date rescheduling remains open.

Workpaper email reminders are now opt-in and phase-aware: owner during preparation, independent reviewer after submission. They reuse the audit calendar, escalation and delivery infrastructure, withdraw stale queue entries atomically, and check live source/profile and both audit/evidence permissions before delivery. Existing workpapers remain opted out. Customer transport UAT, digest/delegation workflows and automatic adjustment of saved deadlines remain open.

Calendar reuse now supports versioned JSON export and preview/apply/save import between audits. Only day counting, working days and holidays transfer; target thresholds, recipients and deadlines remain intact. Inputs are bounded and strictly validated. Admin-managed central calendar versions are delivered below; automatic propagation and holiday feeds remain open.


Audit starter task packs now support selecting and editing the four planning stages, explicit per-task dates, eligible owner assignment, optional sequencing, exact no-write preview and atomic multi-task creation. Invalid input, permission/graph races, closed audits and history failures leave no partial pack; stable IDs prevent duplicate retries. Existing My Work/report/closure behavior is reused. Central shared templates are delivered below; inferred scheduling remains open; independent milestone sign-off is delivered below.


Shared audit templates now cover plan narratives, single-task text and customizable 1–12-task packs. Admin publication, reasoned versioning, archive/reactivation, retained immutable history and cross-audit/account reuse are implemented with explicit draft previews. Current Admin/revision guards and atomic history prevent partial or stale publication. Structured people/dates/state/evidence are excluded, and instantiated records never auto-update. Shared calendar management is delivered below; background recurrence and automatic deadline planning remain open; independent milestone sign-off is delivered below. See [Shared audit template library](audit-template-library.md).


## Independent milestone sign-off — 23 October 2026

Structured milestones now support Admin-configured independent reviewers and review deadlines. Preparation, submit, return, resubmit and approve are connected to My Work, phase-aware opt-in reminders, dependencies, immutable report snapshots and whole-audit closure. Submitted records are locked; no owner, submitter or unassigned Admin may approve. Revision and live account/policy guards cover decisions atomically with history and reminder withdrawal. Recurrence copies the requirement and date gap without copying approval. Existing milestones/task packs keep their previous behavior until an Admin configures review. Multi-level sign-off, certified signatures and automatic recurrence remain separate scope. See [Audit milestones](audit-milestones.md).


## Shared calendar management — 23 October 2026

Organization calendars now reuse the Admin-managed versioned library, with reasons, archive/reactivation and retained immutable history. Audit writers preview working-day and holiday differences, explicitly apply/save a current active version, and retain validated source provenance. Update checking exposes newer versions; existing audits keep their pinned calendar until a writer adopts a change. Thresholds, escalation recipients and actual deadlines are preserved. New adoption binds the source revision/archive state atomically with profile/history/queue changes; stale sources retain the draft for recovery. Automatic bulk propagation, holiday feeds, delegated calendar administrators and automatic deadline adjustment remain open. See [calendar workflow](audit-reminder-profiles.md#shared-organization-calendars).


## Shared view version history — 23 October 2026

Admin-published views now retain immutable name/criteria snapshots, changing actor, optional reason and restore provenance across the seven supported registers and My Work. Authorized users inspect current and historical definitions; Admin explicitly previews and restores an exact old definition with a required reason. Restore creates a new revision and leaves current register filters unchanged. The current definition, history and legacy baseline capture commit atomically with live identity/policy/revision checks. A removed definition remains tombstoned; retained history is not exposed after removal. Personal preferences retain their previous behavior. The latest 50 versions are listed with an explicit bound; all historical events remain retained. Group publication, default application, scheduled exports and independent sign-off remain separate. See [Account and team views](account-team-views.md#team-version-history-and-restore).


## Approved workpaper exceptions to CAPA — 23 October 2026

Full-access Admins and assigned Editors can preview and explicitly promote an approved sample exception into the canonical CAPA lifecycle. Immutable origin records retain the audit, paper revision, sample, pinned evidence metadata/hash and reason; source evidence never substitutes for remediation verification. One promotion per normalized sample, stable IDs, live identity/policy/source guards and atomic finding/link/history writes prevent duplicates and partial intake. Current CAPA status and exact navigation work in both directions. New audit report/closure snapshots include origin details; existing whole-audit closure policy is preserved. Scoped CAPA access, bulk/unattended promotion, per-sample independent approval and statistical sampling remain open. See [exception handoff](audit-workpapers.md#exception-to-capa-handoff).


## Explicit working-day deadline planning — 23 October 2026

Editable milestones and workpapers now preview each entered deadline against the saved audit calendar, apply next-working-day dates to a draft with a reason, undo the proposal, and save through existing lifecycle permissions. The server recalculates results and atomically binds exact calendar contents/revision to the record and immutable history; calendar conflicts preserve drafts and support calendar-only recovery. Editor access does not bypass Admin-only milestone review-date changes. My Work and future report/closure snapshots use the saved dates. Task-pack adjustment is delivered below. Automatic propagation/rescheduling, recurrence adjustment and dependency-wide scheduling remain open. See [deadline planning](audit-deadline-planning.md).


## Evidence request deadline planning — 24 October 2026

The working-day planner now covers request create/edit and the assigned independent reviewer's return decision. It preserves evidence periods and pinned versions, retains draft fields/decision reasons across calendar recovery, and records the exact calendar/date proof only in the relevant event. Silent drafts, explicit launch/activation, resubmission after editing a submitted request, independent acceptance and closure locks retain their existing behavior. Adjustment commits also bind the work-plan state/revision/zone and acting account; calendar refresh never silently adopts a newer request revision. Task-pack adjustment is delivered below; automatic recurrence/dependency scheduling and automatic calendar propagation remain open. See [request planning](audit-deadline-planning.md#evidence-request-dates-and-independent-return).

## Reproducible random workpaper sampling — 25 October 2026

The workpaper editor now accepts a complete CSV population (5000 rows / 256 KiB), previews a seeded selection of up to 100 units without replacement, and requires explicit draft replacement and save. The server recomputes the versioned algorithm and binds exact references/counts to the normal authorized revision-checked transaction. A retained selection record includes the normalized-population fingerprint, seed, selected references, reason and saving identity/time; review, history and new report/closure snapshots preserve it. Re-uploading the original source can reproduce the draw. Source CSV retention remains the organization's evidence responsibility. Statistical confidence/precision/sample-size calculations, stratification, unattended selection and independent per-sample approval remain open. See [workflow and reproduction contract](audit-workpapers.md#reproducible-random-selection).


## Task-pack working-day planning — 25 October 2026

Selected pack tasks now share a reasoned, no-write working-day preview with unchanged-date visibility, explicit apply/undo and calendar-only recovery that retains draft text and selections. Exact task IDs, all selected dates and time zone are recalculated against the saved calendar; its revision and contents are bound in the existing atomic task/history transaction. Stable IDs survive re-preview and retries. Each creation event retains calendar/date proof, and My Work and new report/closure snapshots use saved dates. Automatic durations, dependency-wide rescheduling, recurrence adjustment and calendar propagation remain separate. See [task-pack date planning](audit-deadline-planning.md#task-pack-dates).


## Reusable list order — 26 October 2026

Seven core register entry points and My Work now expose module-specific sort fields and directions. Browser/account/team views and immutable team history preserve the order; legacy definitions retain their default. Missing values remain last, assessed risk scores sort numerically, and full filtered collections are sorted before pagination. Audit results and My Work CSV follow the selected order. Scope, permissions, summary counts and business records are unchanged. Background recurrence, delegation and external engagement grants remain separate packages. See [saved order](saved-register-views.md#list-order).


## Reliable register import — 26 October 2026

Seven register import entry points now retain physical XLSX column/row positions, reject ambiguous headers/mappings and explicit limits, and show actual row errors plus a paginated preview. Server validation makes no business-record changes; commit preserves current module permissions, reference integrity, closed-audit locks and atomic rows/codes/receipt writes. Actor-scoped operation IDs make a lost-response retry return the original result without duplicating or resurrecting records. Existing clients without a token remain compatible but are not retry-deduplicated. The full vendor inventory exposes import with explicit adoption into TPRM. Evidence retains its required document-upload/versioning workflow. This confirmed data-integrity fix is separate from background recurrence, delegation and external engagement grants. See [workflow and operator limits](register-import.md).


## Workflow decision evidence usage — 27 October 2026

The existing Evidence Library usage workspace now includes retained continuity exercise/gap and regulatory submission/verification decisions. It shows purpose, actor/time and pinned-version identity alongside the live source state, with source filtering and sanitized export. All decision rows are explicitly historical; prior submissions survive later review cycles and uploads without being presented as current approval. Full-access readers may inspect them; scoped enterprise sources remain restricted. Each source has a 200-decision bound, missing parents remain visible as limited coverage, and unavailable sources never appear complete. Exact source navigation prioritizes a target and its parents within existing list bounds; failed/missing reads and superseded responses have explicit recovery. General archive scanning, automatic reassessment, organization-scoped enterprise grants and additional review-task types remain separate. See [usage and source limits](evidence-usage.md) and [delivery evidence](roadmap/workflow-evidence-usage.md).


## Continuity responsibilities in My Work — 27 October 2026

The existing inbox now includes continuity plan approval/activation/review, exercise facilitation and improvement-gap responsibilities, with exact canonical navigation, lifecycle-specific assignments and source dates. Cancelled/completed exercises, retired plans and closed gaps leave active work; recent completion uses actual terminal timestamps, including retained cancellation events. A metadata-only authorized read limits each collection to 2,000 with lookahead; failed, malformed, orphaned or bounded coverage disables CSV, and failed enterprise sources do not retain stale queue rows. No new menu, theme, mutation route, reminder, scoped enterprise grant or automatic recurrence is introduced. See [workflow and limits](continuity-my-work.md) and [delivery brief](roadmap/continuity-my-work.md).

## Periodic continuity plan review — 27 October 2026

The plan review responsibility now has a completion path in the existing Continuity module: full plan details, an independent assigned Admin decision, explicit next review date and retained reviewed-plan snapshots. Active plan work also reaches that reviewer in My Work. Current source and actor state are guarded at commit; conflicts preserve the draft and repeated identical requests return the original result. The latest 20 reviews display with explicit retention limits. Structural plan editing/reapproval, automatic reminders and exercise effectiveness certification remain separate. See [workflow and limits](continuity-plan-review.md) and [delivery brief](roadmap/continuity-plan-review.md).

## Connected third-party decisions — 27 October 2026

TPRM now reuses the directory and canonical evidence-version workflow for onboarding/finding assignments and assessment, remediation and exit decisions. The selected file version, source change and event commit atomically. Current source context and explicit revision acknowledgement preserve decision drafts during conflicts/read failures. Retained history and Evidence Usage cover all six decision purposes with exact assessment/finding/vendor navigation beyond normal list boundaries. Scoped accounts remain outside these enterprise sources; history does not imply current approval. Existing free-text API clients do not acquire canonical pins. This removes duplicate account/hash entry; customer adoption and time-to-complete are unmeasured. External supplier questionnaires, supplier portals, automated reassessment scheduling and deeper concentration/fourth-party analysis remain separate product scope. See [connected TPRM evidence](tprm-connected-evidence.md).

## Policy campaign completion — 27 October 2026

The existing attestation workspace now exposes Admin campaign outcomes, exact linked policy content, searchable participant notes/statuses and reasoned closure. Accepted, declined and unanswered results remain distinct in retained history; closure removes pending work/actions and the open-campaign retirement blocker. Full outcome revisions, live account checks and an atomic event protect concurrent responses; explicit current-result adoption and idempotent retries cover recovery. The 500-recipient detail limit and 1,000-campaign list limit are explicit. No new menu, palette, schema, external notification, reopening or automatic scheduling is added. This resolves a source-confirmed completion gap; customer adoption remains unmeasured. See [campaign workflow](policy-campaign-completion.md) and [delivery brief](roadmap/policy-campaign-completion.md).

## Connected policy decisions — 27 October 2026

Policy Center now reuses eligible directory assignments and the canonical evidence-version selector for version submission/approval/publication, exception approval/closure and retirement. The complete displayed source, live actor and selected file are guarded at commit; decision conflicts/read failures retain drafts and require explicit adoption of changed context. Separate immutable pins appear in source history and historical Evidence Usage, with exact policy/version/exception navigation. Existing independent approval and retirement blockers remain authoritative. Legacy free-text clients do not gain canonical pins. This closes confirmed duplicate entry and source-recovery friction without a new schema, palette, menu or email setting. Adoption is unmeasured; external portals, automatic reassessment and general retention certification remain outside scope. [Workflow and limits](policy-connected-evidence.md); final revision receipts belong in the delivery PR.

## Connected CAPA decisions — 28 October 2026

The CAPA workspace now reuses eligible directory assignments and the canonical evidence-version selector for remediation submission, independent closure and reasoned risk acceptance. Full reviewed source and live identity are guarded with the transition; source changes and read/write failures preserve decision drafts and require deliberate context recovery. Each event retains its own evidence, surviving reopening and later uploads. Evidence Usage separates these historical decisions from current mutable references and opens the exact finding; restricted, missing and bounded coverage remains explicit. Existing independent review and governance gates remain authoritative, and legacy clients do not gain canonical pins. This resolves confirmed duplicate account/hash entry; adoption and time saved remain unmeasured. External portals, annual capacity planning and automatic reassessment remain separate scope. [Workflow and limits](capa-connected-evidence.md); final revision/test/release receipts belong in the delivery PR.

## Connected incident decisions — 28 October 2026

Security Incidents now connects directory-based ownership and independent review to actual file-version selection across containment, eradication, recovery, review and closure. Complete reviewed source, actor and evidence guards protect atomic transition/event/pin writes. Source conflicts and unknown outcomes retain decision drafts and require explicit current-context adoption; stable declaration IDs prevent duplicate retries. Per-incident paginated history retains reviewed context and event-specific evidence. The new Incident decisions source in Evidence Usage preserves five historical purposes and reaches the exact incident beyond ordinary list bounds. Palette and notification settings are unchanged. Adoption is unmeasured; external response orchestration, legal notification advice, automatic reassessment and customer UAT remain separate. [Workflow and limits](incident-connected-evidence.md); final acceptance and release receipts belong in the delivery PR.


## Incident responsibilities in My Work — 28 October 2026

The existing inbox now includes incident response assignments and independent closure handoff, exact incident navigation, localized stages and critical/high priority. Closed work uses the actual closure timestamp; reopening restores response work. Detection dates do not become invented deadlines. Metadata-only reads retain enterprise access, a 2,000-record lookahead bound, active-first ordering and explicit incomplete/failure recovery with CSV disabled. This closes a source-confirmed missing responsibility after connected incident decisions. No migration, menu, palette, reminder or permission change. Customer adoption remains unmeasured. [Workflow and limits](incident-my-work.md); final validation and release receipts belong in the delivery PR.

### Published policy periodic review — 28 October 2026

Source-confirmed gap: published policies already enter My Work by `next_review`, but had no explicit current-version suitability review. This delivery adds independent periodic review with a frequency-bounded next date, immutable full policy/version snapshots, pending-version blocking, stale-source recovery and idempotent request replay. Existing content publication and attestation workflows remain authoritative. See [brief](roadmap/policy-periodic-review.md) and [operation](policy-periodic-review.md). Implementation validation and immutable release receipt belong in the PR; production deployment, customer UAT and measured adoption remain unverified.

## Supplier review scheduling at decision — 29 October 2026

Source-confirmed gap: approving a new assessment never advanced the supplier's review date, so a completed review could remain overdue. The existing independent approval/conditional dialog now chooses a contract-bounded next date and commits it with the assessment, core vendor, retained event and canonical evidence. Earlier schedules remain visible after renewal; stale-source and lost-response recovery preserve human decisions. No frequency policy, contract editing, automatic renewal, menu, palette or notification is added. Legacy API calls without the scheduling contract retain their date. See [brief](roadmap/tprm-review-scheduling.md) and [operation](tprm-review-scheduling.md). Final validation and release identities belong in the PR; production/customer UAT and adoption remain unverified.

## Trustworthy TPRM completion history — 29 October 2026

Existing vendor assignments were already connected to My Work. This package addresses confirmed history defects: terminal decisions lost their deciding reviewer and used mutable update time as completion. A metadata-only source now retains actual decision/verification/exit dates and historical deciding/verifying identities, with active-first bounded reads, explicit incomplete coverage, localized stages and existing exact navigation. Renewal does not manufacture a recent completion; reopening restores owner work. No new task store, migration, palette, menu or notification is added. Review-date scheduling, external portals and adoption evidence remain separate. See [brief](roadmap/tprm-work-history.md) and [workflow](tprm-work-history.md); final test/release receipts belong in the PR.

## Directory-based policy campaign issuance — 28 October 2026

The source-confirmed preceding handoff accepted free-text recipients without ensuring they could answer. The existing campaign entry now selects explicit eligible directory accounts, reviews the exact published policy and identities, and atomically creates canonical assignments with live source/account guards and stable retry identity. Outcomes show creator/time and subjects use the existing My Work response flow. No schema, palette, scheduling, notification delivery or group expansion is introduced. Legacy manual-email API clients remain compatible without reviewed-mode guarantees. See [brief](roadmap/policy-campaign-issuance.md) and [operation](policy-campaign-issuance.md). Final test and immutable release evidence belong in the PR; production deployment, customer UAT and adoption remain unverified.

## Assigned policy reading and response — 28 October 2026

Source-confirmed gap: the subject's Accept/Decline dialog previously showed only note and confirmation, without the campaign's assigned policy text. This package connects the exact issued version to subject response, retained immutable context, full-source/account concurrency checks and lost-response replay. Existing campaign counts, closure and My Work remain canonical. See [brief](roadmap/policy-subject-response.md) and [operation](policy-attestation-response.md). Final validation and immutable release identities belong in the PR; production deployment, customer UAT and adoption remain unverified.
