# Product research delivery status — 18 October 2026

This reconciles the ten delivery packages in the 14 October GRC product study with the implementation on `main` at `9f6bacf7b24ccce48b9d845f30bf8d63d9b71828`. It is a scope inventory, not a claim that every research acceptance scenario or customer integration has passed. The user's latest direction is functional improvement within the existing theme.

| Research package | Implemented scope | Remaining scope |
| --- | --- | --- |
| P0: audit task chain | Silent request drafts; exact launch/addition preview; owner and independent reviewer; submission, return, resubmission and acceptance; exact My Work links. | Milestone text does not automatically create scheduled tasks. |
| P0: reminder profiles | Existing outbox/transport reuse; assignment and due milestones; separate owner/reviewer dates; IANA time zone and stale-recipient checks. | Business-day/holiday calendars, delegation, configurable escalation/digest profiles, absolute task links in email and customer SMTP/Graph validation. |
| P0: evidence period and review | Version-pinned requests, acceptance criteria and dates; safe text/CSV/JSON preview; supported DOCX/XLSX uploads; independent version review. | Period/content adequacy remains human review. Full Office visual preview and automatic re-evaluation after general library changes are separate work. |
| P0: audit closure | Immutable application snapshots for request-work-plan closure/reopening; separately saved audit status reports with verified exports. | Whole-audit approval/closure across requirements, findings and final opinion; independent report sign-off and attachment retention/bundles. Request-plan closure is not whole-audit closure. |
| P1: external auditor workspace | Existing authenticated internal access and module grants. | External, time-bound engagement/period/version grants with matching file and export enforcement. |
| P1: workpapers and sampling | Requirement/test register, control tests/automation and engagement methodology text. | Structured populations, samples, workpapers and sample-level review history. |
| P1: control/finding lifecycle | Connected control/evidence/findings context, canonical CAPA, independent review/retest and exact navigation. | Further change-impact orchestration across all open work is not established as complete. |
| P1: enterprise operations evidence | On-prem packages, Docker/Podman compatibility, system/connector health and backup/recovery guidance. | Real customer SSO/mail/ticket UAT and an installation-specific restore exercise. CI is not customer UAT. |
| P2: scale and deep planning | Explicit bounded/incomplete reads; paginated register search and selected workspaces. | Risk-based annual planning, capacity allocation, advanced sampling and customer-scale benchmarking. |
| P2: reasoned AI assistance | Existing governed AI workspace and human-controlled model decisions. | Do not treat the entire proposed source-grounded review/mapping assistant or adversarial acceptance matrix as delivered by the recent UI/search increments. |

## Recent product-wide improvements

PR #314 added authorized search across eight core registers, exact-record navigation, per-user/module/tab query and filter memory, previous-view return and source-error retry. This is broader navigation/workflow work, not delivery of every research package. The earlier audit/control/evidence workspaces are documented separately.

The email simplification keeps transport configuration and testing, delivery deadlines/retry policy and recipient frequency limits. It removes delivery/dispatch/recovery/deferral history, queue counters and manual operational actions from the Email & Notifications screen. It does not delete stored audit data or disable scheduled delivery.

## Implementation references

- `docs/audit-request-workflow.md` and `app/audit-request-notifications.ts`
- `docs/audit-engagement-planning.md` and `app/audit-plan.ts`
- `docs/audit-status-reports.md`
- `docs/research-workspaces.md`
- `docs/integrations/control-assurance-workspace.md`
- `docs/integrations/capa-control-context.md`
- `docs/integrations/ai-model-decisions.md`
- `docs/record-search.md`

Next functional priority: whole-audit closure and approval, followed by business-day/escalation configuration. These are pending scope, not features added by the email-settings change.
