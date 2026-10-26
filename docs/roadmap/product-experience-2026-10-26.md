# Product experience: clear next actions and readable shared workspaces

## Decision and scope

The 26 October live review and PR #354 browser artifacts show that operators need clearer record workflows and consistent navigation. First repair the QA scenario's case-sensitive risk header lookup and closed AI-group lookup without weakening visibility checks. An early light-theme screenshot showed faint sidebar text; subsequent captures with animations disabled showed normal opacity, so measured contrast checks decide whether palette changes are needed.

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

The wider browser regression also found that the global assurance notice pushed the report register too far below its scope controls. Keep the notice, recovery and separately scoped assurance download together in the existing Global GRC assurance disclosure. Filtered HTML/PDF/CSV exports retain their own visible source status and gates. Preserve the existing register-proximity and export regression assertions.

## Delivery record

PR #354 revision `49b9563b7bfc30a17cfe67b63c6b14134cf53412` passed standard CI, including unit/regression tests, typecheck, build, dependency audit and Docker/Podman on-prem integration. Its live fixes browser regression and all 21 product-experience checks passed: TR/EN filter recovery, six register creation entry points, form guidance/Escape/focus, light/dark sidebar contrast, loading/retry and reader presentation. Reader and source-state scenarios use isolated read-response UI fixtures; API authorization is covered separately. The preceding visual matrix passed all 324 combinations (27 menus × two languages × two themes × three widths); the complete current workflow is still running.

Visual inspection of the new narrow form artifact identified a clipped risk calculation card. The follow-up stacks its metrics at narrow widths and adds explicit internal-overflow assertions. Source failure/loading also now suppresses unverified register summaries and counts instead of presenting misleading zero totals. Revision `7596c336f239a95de659493154f048b1cd8ec225` passed standard CI and the expanded product-experience browser checks for these fixes. The keyboard-order refinement gives progressive controls a native slot before the fields so visual order and Tab order agree, with real Shift+Tab/Tab assertions. Its TR checks passed on `bb7df3c468c5c7e745ff2642358fafddd170a914`; EN theme switching exposed a transient contrast failure: the surface changed immediately while navigation foregrounds were still animating from the previous theme. Navigation now switches text and background colors together, retaining only non-color motion. The older saved-view and CRUD checks now assert the new filtered-empty state instead of the removed placeholder table cell. The complete latest browser workflow remains the release gate. No schema or palette changes; no merge, deployment or customer UAT claim.
