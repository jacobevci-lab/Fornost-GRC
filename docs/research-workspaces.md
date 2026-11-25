# Research-led audit, control and evidence workspaces

The 14 October product study proposed a clearer audit workspace, a contextual control detail and side-by-side evidence review. This increment implements that structure using the existing records and authorization rules.

## Audit

An audit now opens with an overview of actual closed/open requirements, evidence-waiting and unassigned requirements, followed by actions into requests, planning and assurance. Counts describe requirement records; they do not certify audit readiness or an audit opinion. There are separate views for requests/review, requirements/tests, plan/scope, assurance and Admin-only reports. No new permissions or approval roles are introduced.

Keyboard arrows, Home and End operate the tab list. Panels stay mounted so switching views preserves unsaved plan, request and report text. Navigating to a different audit resets its workspace. Exact request links open Requests and review; core requirement links open Requirements and tests. The existing APIs continue to reject stale, conflicting or unauthorized mutations. Legacy requirements whose audit is missing remain reviewable and editable from exact links; the workspace explicitly identifies the missing audit link, exposes recovery, and omits plan/request/report/assurance actions that require an active engagement.

Plan fields are grouped into purpose/scope, team, dates and methodology/deliverables, with section navigation and a persistent save bar. Section counts indicate populated fields, not required-field completeness or approval. Reports open directly in their dedicated view and preserve the existing immutable snapshot and export behavior.

## Control

Selecting a control opens its evaluated context beside the queue on wide screens. The detail shows the current reason for attention, owner, implementation state, eligible evidence and next test separately. Overview, evidence, tests/automation, mappings and findings are distinct views. Existing source-completeness gates, honest unavailable values and exact record navigation remain intact.

## Evidence

The library preview shows the file beside period, ownership, reviewer, control references, source and version metadata. Library status is explicitly distinct from request acceptance. A submitted audit request shows its pinned version beside its acceptance criteria, dates, submission and existing review actions. Changing a version in the library does not replace that pinned preview.

The preview fetches only the existing authenticated evidence endpoint and creates a short-lived local blob for approved PDF/image types. UTF-8 text, CSV/TSV and JSON are rendered as escaped React text, never HTML. Reading is bounded by the existing 10 MB upload limit; displayed text is capped at 120,000 characters with an explicit notice. PDF previews start fitted to the available width with the native thumbnail pane closed, including after mobile resizing. Unsupported Office previews use the original download. Abort, timeout, retry and object-URL cleanup are handled; selection changes remount the preview so earlier responses cannot populate another file. No external preview provider receives a document.

## Validation scope

The isolated browser checks cover desktop/mobile and both languages/themes, tab keyboard behavior, draft retention, actual requirement counts, control drilldown, PDF and CSV evidence views, escaped script-like text and accessibility. Existing plan, request lifecycle, report export, readiness, requirement pagination and control assurance regressions follow the new visible tab navigation without relaxing their domain assertions. Customer SMTP, SSO and external provider delivery remain separate deployment validations.

Whole-audit sign-off, externally scoped auditor access, configurable holiday/escalation profiles, and full DOCX/XLSX visual previews are not added by this UI increment.
