# Product research delivery status — 20 October 2026

This reconciles the ten delivery packages in the 14 October GRC product study with implementation through structured audit milestones and personal saved register views, including whole-audit closure, workpapers, record/task links and their My Work handoff. User-facing entry points are the [Product overview](PRODUCT-OVERVIEW.md), [User guide](USER-GUIDE.md) and [Admin guide](ADMIN-GUIDE.md). It is a scope inventory, not a claim that every research acceptance scenario or customer integration has passed. The user's latest direction is functional improvement within the existing theme.

| Research package | Implemented scope | Remaining scope |
| --- | --- | --- |
| P0: audit task chain | Silent request drafts; exact launch/addition preview; owner and independent reviewer; submission, return, resubmission and acceptance; exact My Work links; explicit owner/date/time-zone milestone tasks with history, report snapshots and closure blockers. | Bilingual plan/milestone draft starters and portable JSON text templates are implemented. Narrative milestones are not automatically parsed; centrally managed template libraries, multi-task instantiation, background recurrence scheduling and independent milestone sign-off remain separate. |
| P0: reminder profiles | Existing outbox/transport reuse; assignment and due milestones; separate owner/reviewer dates; IANA time zone and stale-recipient checks; per-audit business-day calendars, manually defined holidays, configurable reminder thresholds and a single authorized escalation recipient; configured absolute audit-task links in email. | Shared/reusable calendars, holiday feeds, delegation, multi-level escalation/digest profiles and customer SMTP/Graph validation. |
| P0: evidence period and review | Version-pinned requests, acceptance criteria and dates; safe text/CSV/JSON preview; supported DOCX/XLSX uploads; independent version review. | Period/content adequacy remains human review. Full Office visual preview and automatic re-evaluation after general library changes are separate work. |
| P0: audit closure | Request-work-plan closure; whole-audit independent approval, return/withdrawal, SQL write locks, reasoned reopening, immutable plan/requirement/request/direct-CAPA package and verified JSON; pending My Work links. | Final opinion templates, independent sign-off of arbitrary status reports, attachment retention/bundles and broader finding-store scope. |
| P1: external auditor workspace | Existing authenticated internal access and module grants. | External, time-bound engagement/period/version grants with matching file and export enforcement. |
| P1: workpapers and sampling | Structured per-audit workpapers, population/source and selection rationale, up to 100 manually selected test units with validated CSV bulk entry, pinned evidence versions, owner submission, independent review/return, reasoned reopen/cancel, revision history and report/closure integration; owner preparation and reviewer handoff in My Work with exact workpaper navigation. | Statistical/random selection, confidence calculations, automatic CAPA creation and scheduled task deadlines, separate per-sample sign-off and customer-scale benchmarking. |
| P1: control/finding lifecycle | Connected control/evidence/findings context, canonical CAPA, independent review/retest and exact navigation. | Further change-impact orchestration across all open work is not established as complete. |
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

Per-audit calendars and single-recipient escalation are implemented; reusable calendars, delegation and multi-level/digest profiles remain separate work. Structured workpapers are delivered within the bounded manual sampling scope above. External auditor access remains a separate package. The email-settings simplification did not itself deliver these capabilities.

- `docs/audit-reminder-profiles.md`

Structured plan milestones: [Audit milestones](audit-milestones.md). These owner tasks are separate from independently reviewed evidence requests and workpapers.

Personal named register views now cover Risk, BIA, Assets, Compliance, Controls, Evidence and audit requirements. These reuse current authorized records; they are browser-local preferences, not server/team views or evidence snapshots. See [Saved register views](saved-register-views.md).

My Work supports a module selector within the current authorized personal/organization scope. Summary counts, due/status filters, completed work, pagination and CSV exports share that selection. Empty module selections remain explicit; the separate assurance signals keep their own scope.

My Work also supports up to ten personal named browser-local views of search, module and work-status criteria. Applying uses current records, resets pagination and preserves current personal/organization scope. These are not team views or snapshots.

Milestone prerequisites now enforce same-audit sequencing, acyclic links and completion before start/complete. Whole-graph revision guards prevent concurrent bypass. My Work identifies blocked work; task history and audit snapshots retain prerequisite IDs. Automatic date rescheduling remains separate; explicit recurring periods are described below.


Milestone recurrence now supports explicit, owner/admin-created next occurrences after completion, with weekly/monthly/quarterly/yearly calendar rules, month-end anchors, previous/next navigation, one-successor protection, and atomic history/report provenance. This closes the manually controlled recurring-task workflow. Background scheduling, automatic catch-up, business-day date adjustment and a centrally managed template library remain open.


Milestone email reminders are now opt-in per task, reuse the audit calendar, delivery retries/rate limits and configured email transport, and revalidate live task/profile/recipient access before dispatch. Queue withdrawal, exact authenticated links and reminder date previews are implemented. No additional log UI is introduced. Customer transport UAT, delegation, multi-level escalation/digests and background recurrence creation remain open.
