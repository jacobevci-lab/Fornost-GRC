# Product experience: clear next actions and readable shared workspaces

## Decision and scope

The 26 October live review and PR #354 browser artifacts show that operators need clearer record workflows and consistent navigation. First repair the QA scenario's case-sensitive risk header lookup and closed AI-group lookup without weakening visibility checks. The uploaded light-theme screenshot also shows faint sidebar text; inspect and fix the shared navigation tokens before qualifying light/dark layouts.

This delivery extends the existing core registers with a shared, contextual empty state and actionable recovery, clearer task-specific descriptions and create labels, and predictable record form guidance. Existing progressive forms, My Work, views, permissions and canonical records remain in place. Do not add another navigation group, business module, telemetry or email-log screen. External-auditor grants, delegation and scheduled recurrence remain later packages.

Entry: an authorized operator opens a register. They can distinguish loading/retry, an empty collection, a filtered-empty result and a selected-record failure. An editor can begin the appropriate existing creation form; a reader receives useful guidance without write controls. Search/filter recovery must retain explicitly selected columns and saved views. Form guidance explains the minimum valid first record and later connected work without changing required data or approval rules.

## Acceptance and validation

- Risk score/status are visible at the agreed desktop width; AI groups open through normal visible summary controls in TR/EN.
- Sidebar labels, active/hover states and icons are legible in both themes; narrow-screen navigation remains usable.
- Shared register descriptions and primary action text name the user's task in TR/EN.
- Empty, filtered, loading and failed source states are distinguishable; recovery does not create data, erase persisted views or show unauthorized actions.
- Creation actions open existing forms; cancel/Escape, required-field validation, draft preservation and keyboard focus still work.
- Relevant browser checks cover TR/EN, light/dark, desktop/narrow layouts and reader/editor behavior using isolated synthetic data. No live customer records or external messages are required.
- Typecheck, lint and meaningful regressions pass; browser results and published revisions are recorded separately. Rollback is a code revert, with no schema migration.

Baseline task-completion time is unmeasured. The outcome is completion of an assigned record/evidence task without learning unrelated menus. Record exact tested scope; do not equate menu visits with full lifecycle or customer UAT.

## Delivery record

Implementation and verification pending. PR #354's initial standard CI passed; Workspace Layout QA failed before completing the new scenarios.
