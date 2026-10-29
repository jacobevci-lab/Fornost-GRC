# Supplier assessment correction

## Complete the review without rejecting the supplier

In **Third-Party Risk Center → Due diligence**, the assigned risk owner can **Edit draft** to correct impact, likelihood, control maturity, the twelve control responses and treatment plan. This works for initial and renewal drafts. The server recalculates coverage, critical gaps and risk scores; the supplier, assessment ID, cycle, dates, assignments and findings stay the same. Supply a reason of 20–1,200 characters and the displayed confirmation phrase. Saving does not submit or approve the assessment.

The assigned independent Admin reviewer can **Return for correction** on a submitted assessment. Explain what needs correcting, inspect the current source and confirm. The assessment returns to draft; the supplier returns to onboarding for the initial cycle or reassessment for later cycles. This is feedback, not rejection, acceptance or a new completed review. The risk owner's existing My Work item becomes active again. The reviewer no longer has a pending decision until resubmission.

The owner opens the exact assessment from My Work, reads the return reason in **Assessment correction history**, edits and saves, then uses the existing **Submit** action with an explicitly selected evidence version. The independent reviewer then approves, conditionally approves or rejects through the existing decision flow. Existing high/critical finding and control-gap blockers remain authoritative.

## Responsibility and history

Draft editing requires an active full-access Editor or Admin whose email is the canonical risk owner, distinct from the reviewer. An unassigned Admin cannot edit on the owner's behalf. Return requires the assigned active Admin reviewer, distinct from supplier creator, business/risk owners, assessment creator and submitter. This keeps preparation separate from approval; use the existing reviewer handoff when the reviewer is unavailable. Owner reassignment is separate scope.

Full-access readers, including Viewer, can inspect correction history. Each event retains before/after scores, questionnaire, treatment, status, revision, previous submission metadata, reason and actor/time. It lists 20 events per page; older events remain retained. Malformed legacy details and unavailable reads are explicit. The history is application audit provenance, not a certified electronic signature or a substitute for database backup.

Returning and editing retain prior submission metadata. It describes previous work, not current acceptance. Existing immutable library pins are unchanged; resubmission selects a version explicitly and adds a new pin. **Evidence Library → Usage and change impact → Third-party decisions** exposes earlier submission versions alongside the latest decision. Completed prior cycles and their actual deciding identities/dates remain intact.

## Recovery

The form binds the exact assessment and supplier source inspected when the first field is edited. **Refresh assessment** shows the latest source separately from the entered draft. A conflict blocks saving until **Use current version** is chosen; this keeps edited fields and reason, clears confirmation and never silently overwrites the draft. Compare the current source with the entered fields before adopting. Failed context reads retain inputs and disable saving; refresh to recover. Closing/navigation discards the local draft; it is not durable autosave.

A lost POST response reloads source and history. Inspect them before retrying: the old context token cannot create a second event. A new explicit adoption is a new decision; identical-content draft saves are rejected. History has its own refresh/retry. Both operations revalidate live identity and guard full assessment/profile contents inside the same transaction as the retained event; a concurrent role/source change or event failure leaves no partial correction.

## API and operations

- `GET /api/third-party-risk?view=assessment-context&assessmentId=…`: current assessment/profile, context token and actor-specific action availability.
- `POST` actions `revise-assessment` / `return-assessment`: `assessmentId`, `contextToken`, `note`, exact `confirmation`; revision additionally requires the three numeric scores, all twelve boolean controls and `treatmentPlan`. Unknown/derived fields are rejected. Existing submission/decision APIs are unchanged.
- `GET …?view=assessment-corrections&assessmentId=…&page=0`: retained history, 20 rows plus lookahead, pages 0–9999. Duplicate/unknown selectors are rejected; history reads are vendor-scoped and use the existing event index.

No new schema, migration, menu, scoring algorithm, theme, notification or transport setting is introduced. Rollback retains the existing event and evidence tables. External supplier questionnaires, automatic reassessment, owner transfer, customer UAT and production verification remain separate.

## Verification

`tests/tprm-assessment-correction.test.ts` runs actual route handlers against transactional SQLite for canonical content, derived scores, initial/renewal returns, My Work ownership, retained evidence, role/independence, full-source/account races, rollback, strict input and paginated/degraded history. `scripts/tprm-assessment-correction-qa.mjs` exercises actual Chromium with owner Editor, independent Admin, Viewer, scoped and anonymous contexts: complete edit/submit/return/correct/resubmit/approve flow, stale and unavailable sources, lost responses, history recovery, exact My Work navigation, two evidence versions, 12 TR/EN light/dark viewport combinations and keyboard/accessibility checks. Evidence is published as `tprm-assessment-correction-preview`. Required full CI/browser and installation gates stay enabled. Final immutable revision and observed results belong in the delivery PR; CI is not customer UAT.
