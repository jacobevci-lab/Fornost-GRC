# Supplier assessment correction — 29 October 2026

## Outcome and evidence

At main `84cc2dc3ca6c77641753ef97fcc1b38392ebb68a`, the TPRM route/UI only offer submission and approve/conditional/reject decisions; there is no draft editing or return-to-preparation path. A reviewer finding an incorrect score or missing control response cannot request correction without a terminal supplier rejection. This source-confirmed core-workflow blocker takes priority over speculative portal/automation expansion. Adoption and time saved are unmeasured.

## Bounded journey

Existing Due diligence assessment → assigned independent Admin returns it with a reason → the same canonical assessment becomes draft and returns to the risk owner's My Work → the assigned active risk owner edits the three scoring inputs, twelve control responses and treatment plan with a reason → submits a newly selected evidence version through the existing handoff → independent reviewer decides normally. Initial drafts are also editable by their assigned risk owner. A reasoned, paginated correction history retains before/after content and actor/time. Return is feedback, not rejection or approval; prior evidence pins/submissions and completed cycles remain intact.

Only the assigned active full-access risk owner (Editor or Admin), distinct from the reviewer, may revise. Admin is not a preparation override: restricting edits to the canonical owner preserves existing and future reviewer independence without an untracked contributor. Only the assigned independent active Admin may return, excluding supplier creator/owners, assessment creator and submitter. No owner transfer, new menu, migration, scoring method, theme, reminder or automatic reassessment.

## Acceptance and risks

- Both initial and renewal drafts can be revised without changing their ID, cycle, dates, findings, assignments or past decisions; server recomputes all derived scores. Submitted/terminal assessments cannot be edited.
- Return requires inspected full assessment/profile context, reason and exact confirmation, changes only the current submitted assessment and profile preparation stage, and gives the risk owner current work. Only a subsequent explicit evidence-backed submission reopens independent review.
- Anonymous/scoped/Viewer, unassigned writer/reviewer and self-review attempts fail through the API; active account/policy and source content are bound at commit.
- Concurrent profile/assessment changes, stale tokens and repeated old requests produce no partial or duplicate write; event failure rolls back the source. Failed reads and unknown POST outcomes retain the draft; explicit context adoption clears confirmation. Changed source inputs are shown separately before adoption; user edits are retained.
- History retains complete before/after assessment inputs, previous submission metadata, reasons and identities in pages of 20. Existing canonical evidence pins remain historical and are accessible via Evidence Usage. Corrupt/unavailable history is explicit, never presented as empty success.
- TR/EN, light/dark, desktop/tablet/mobile, keyboard and accessibility support the complete journey.

## Validation and release

Real route/transaction tests cover state, permissions, races, rollback, derived scores, history bounds and retained evidence. Actual Chromium covers owner/reviewer/My Work round-trip, corrections, conflict and source failure recovery, lost-response duplicate rejection, Viewer history, localization/layout/a11y and owned synthetic cleanup. Existing TPRM reviewer handoff and connected evidence flows remain regression coverage; required build/lint/typecheck/on-prem/CI gates remain enabled. Exact test and release receipts belong in the PR. Rollback reverts application code and retains existing events and evidence; there is no schema migration. Production deployment, customer UAT and measured adoption remain unverified.
