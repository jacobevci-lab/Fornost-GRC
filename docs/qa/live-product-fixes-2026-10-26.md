# Live product QA fixes — 26 October 2026

## Delivery brief

Baseline: production and main `4170161d34f3d8ee238639641424d1700c321e5c`. Admin desktop browser QA found eight issues affecting assurance decisions and the connected record journey. The outcome is reliable source-specific evidence assessment, understandable quality states and navigation that preserves the operator's work. This delivery addresses F01–F08 from the live QA report; it does not add new business modules or change the theme.

- F01: preserve independently verified evidence/control metrics when audit scope is incomplete; identify blockers and keep composite scores/exports gated.
- F02: use canonical evidence eligibility and assessment timestamps for list and quality states; distinguish workflow status from computed eligibility. Never rewrite historical approvals.
- F03/F04: preserve source view and exact-record context across handoff, return and reload, scoped to the signed-in user/tab and revalidated against current authorized records.
- F05: prioritize risk score/status in the default desktop register without discarding explicit column choices.
- F06: translate account/resize labels and correctly name unfiltered report criteria in every export.
- F07: show the actual object title and unique target code/module in graph actions.
- F08: provide an inventory entry action and task-oriented AI navigation; explain provider-independent governance separately from AI inference.

Acceptance includes missing/expired/rejected evidence, unavailable sources, unassigned audit items, denied/missing targets, refresh/return, storage failure, TR/EN and keyboard paths. Existing API authorization, pinned evidence, independent review and export safety remain authoritative. No database migration or production data mutation is intended. Reverting the code commit is the rollback path; browser preferences are optional hints, never access grants.

## Validation and delivery record

Implementation, tests, browser verification and publication will be recorded separately below. No customer UAT, full-role security audit, full CRUD, mobile qualification or production rollout is implied by the original observation report.

### Local validation

- Implemented F01–F08 on `fix/live-qa-product-20261026`; no database migration, permission expansion or production data mutation.
- Added real SQLite regression for independent evidence readiness with orphan audit requirements, malformed snapshot rejection and unavailable evidence sources. Added expiry/approval consistency, descriptive graph titles and user-isolated navigation persistence tests. The targeted assurance/navigation set passed 39 tests.
- Final implementation commit: `70b57537c7541ff4b887e6f0cab151126135dd6f`.
- Full local regression on that implementation passed all 1,582 tests, with zero failures, skipped or cancelled tests (`node --import tsx --test --test-concurrency=2 tests/*.test.*`). An earlier run exposed an action-column width regression; restoring its 180 px area resolved it, and the complete suite was rerun. Scores/status remain prioritized through column order and compact defaults.
- TypeScript, lint of all 29 changed source/test/script files, production build and artifact validation passed on the final implementation commit. Migration preflight, on-prem installer smoke and changed browser-script syntax checks also passed during this delivery. The installer smoke is not a customer recovery exercise.
- Added `scripts/live-product-fixes-qa.mjs` to the existing isolated Workspace Layout QA workflow. It checks partial assurance, expired evidence, graph return after reload, desktop risk columns, English labels/CSV criteria and provider-independent AI onboarding, with screenshots. Updated existing AI browser scenarios to open the new task groups through visible controls.
- Browser scenarios for the changed revision have been authored but have not run. Browser CI, merge, deployment and production verification remain pending. The earlier live observation report describes the baseline, not this changed revision.

### Publication status

The implementation is committed locally on `fix/live-qa-product-20261026`. Automatic approval review rejected `git push` because explicit authorization for this external code transfer was not established and the destination was not trusted by that review. The configured destination was subsequently verified as `github.com/jacobevci-lab/Fornost-GRC`, matching the source repository; the added-line scan found no known private-key/token patterns. These checks are not a guarantee that every possible secret is absent. No alternative upload was attempted, no PR was created and no production data was modified. Explicit permission to push this branch and open its PR is required before publication resumes.

On 26 October 2026 the user explicitly authorized publication and requested that routine pushes and PRs for this repository proceed without repeated confirmation. The approval block above is resolved. The command-line push then failed because no GitHub HTTPS credentials were available in that shell; publication continues through the connected GitHub account. Browser CI and deployment must still be verified independently.

These final validation/publication updates change documentation only after the tested implementation commit. Publication through the GitHub connector may produce a different commit SHA; the complete Git tree is compared with the local tree before creating the PR.
