# Whole-audit closure and independent approval

The audit workspace now includes **Closure and approval**. It captures the saved engagement plan, requirements, evidence-request decisions and directly linked enterprise CAPA findings in one immutable application snapshot. This is distinct from request-work-plan closure and from an ordinary status report. The current lifecycle appears on portfolio cards and in the audit workspace; pending approval also appears in the preparer/reviewer's My Work with an exact package link.

An active Admin prepares the closure summary, selects another active Admin, records scope limitations and, when linked findings remain open, explains their follow-up. The assigned reviewer inspects the saved package and can approve or return it with a reason. The preparer can withdraw a pending package, including when the reviewer becomes unavailable, and resubmit to another reviewer. A preparer cannot approve or return their own submission; another administrator cannot substitute for the assigned reviewer. Existing CAPA report access is Admin-only, so closure packages and their exports use the same boundary. Other audit readers see the lifecycle badge without the package, reviewer identity or CAPA details.

## Closure conditions and scope

- A saved plan must include objective, scope and lead auditor.
- At least one requirement must exist, and every included requirement must have a completed status.
- If requests exist, each must be accepted or cancelled and their request work plan must be closed. An audit with no requests can close without a synthetic empty work plan.
- Every directly linked finding not in `closed` status must have a recorded owner and valid due date. A nonempty follow-up plan is required. Risk acceptance is still counted as not closed, and overdue dates remain visible; closure does not assert that remediation is complete.

Scope is inherited from audit status reports: requirements match the exact portfolio audit name, and enterprise findings use source type `audit` with the exact audit ID, requirement ID or unique requirement code. Ambiguous ID/code aliases block the package. Other finding stores, indirect/shared-control links, free-text audit-name references, attachment bytes, unsaved edits and live readiness calculations are excluded. The reviewer must assess completeness and evidence adequacy. The application does not generate an audit opinion, certification, or a clean bill of health.

## Consistency, locks and history

Migration `0091_audit_closure.sql`, canonical schema and the idempotent runtime initializer provide current lifecycle and append-only decision records. Submission claims its intent and saves the entire bounded status-report snapshot and lifecycle transition in one D1 transaction. A snapshot insertion error rolls back the event and state too. Exact workflow/source revisions and active account/role checks are evaluated at commit. Intent IDs bind actor, action, source and narrative; a lost response can be retried without creating duplicate decisions or appending duplicate snapshot items.

Sources may change while approval is pending. Approval verifies the saved package hash and requires the original source revision at commit. A changed source requires return/withdrawal and resubmission; refresh alone never silently substitutes a new package for one already under review. Existing source revision tracking is installation-wide, so a change to another audit or enterprise finding can conservatively invalidate a pending package. Report-row mutation also invalidates pending approvals. This conservative boundary is visible in the conflict guidance.

Approval locks audit identity/deletion, requirement insertion/update/deletion/movement, existing requirement codes, plan/catalog metadata, requests and request workflow writes using SQL triggers. The standard API paths return a conflict explaining the closure lock. Legacy first-time requirement code backfill remains possible on reads; already assigned codes cannot be replaced. CAPA and shared evidence/control records remain operational; their later state never changes a saved package. An Admin can reopen the audit with a 10–4,000 character reason. Reopening preserves prior submissions, decisions, snapshots and the separate request work-plan state; it does not resend accepted work or automatically reopen a request plan.

The latest 20 decisions are listed with explicit truncation. Every retained decision ID can be read/downloaded while its parent audit exists. JSON includes the decision and complete saved report, each with a deterministic SHA-256 digest verified again on download. Missing or modified source snapshot rows block verified package access and approval. There is no application update/delete endpoint for events or saved reports. This is application immutability and corruption detection, not a digital signature, WORM retention or protection against an administrator rewriting database rows, triggers and hashes. Deleting a reopened audit makes its retained packages inaccessible, consistent with existing report retention.

## Bounds and verification

The existing complete-report bounds apply: 2,000 requirements, 500 requests, 1,000 linked findings, 8 MB of source data, bounded snapshot chunks. Reviewers are listed up to 1,000 with truncation disclosed. The pending My Work projection is bounded to 1,000 packages and reports incomplete sources explicitly. No new mail is sent by this feature.

SQLite-backed regression tests exercise independent/disabled roles, exact parent access, blockers, source/account races inside commit, transaction rollback, stable retry intent, stale decisions, closure write locks, CAPA follow-up, retained reopening and integrity failures. Dedicated isolated Chromium QA uses separate preparer/reviewer/editor sessions, real API writes, My Work navigation, stale-source return/resubmission, duplicate-click handling, closed CRUD/import/plan/workplan/delete rejection, JSON verification, late navigation and TR/EN desktop/mobile views in both existing themes.

Final opinion templates, independent approval of arbitrary status reports, external auditor grants, attachment bundles and retention policy remain separate capabilities.
