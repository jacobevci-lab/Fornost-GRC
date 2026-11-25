# Reusable working order — 26 October 2026

## Outcome and priority

An operator returning to a risk, evidence or work queue needs the same decision order as the saved view. The current shared view state stores query, filters and columns only; core registers expose no explicit order and My Work always uses its built-in priority order. This confirmed gap affects seven register entry points and My Work. Complete it before introducing unattended recurrence or external-auditor access, which have wider operational and permission boundaries.

Add explicit, bilingual field/direction controls and persist the choice in browser-local, account and team views, including version history and restore. Reuse existing records, authorization, view APIs and history transactions. Missing values stay last in either direction, numeric scores sort numerically, and ties remain deterministic. Sorting happens before pagination and exports follow the selected order. Clearing search/filters preserves order; choosing Default or applying a legacy view restores the existing order. Session preferences are isolated by user/module. No business data writes, schema migration, new menu, palette change, automatic default/team application or broader data access.

## Acceptance

- Risk scores use the same assessment function as the displayed domain model; dates and numeric fields have explicit ordering and unknown values remain last.
- Sorting works across Risk, BIA, Assets, Compliance, Controls, Evidence, audit requirements and My Work without changing membership, ownership scope or summary counts.
- New browser/account/team views and restored team versions retain sort; legacy definitions remain valid. Unsupported/malformed sort definitions fail validation without partially applying criteria.
- Sort applies to the entire filtered collection before pagination; audit and work CSV downloads use the same order. Exact record focus and previous-view navigation retain existing semantics.
- TR/EN, desktop/narrow layout, keyboard controls, reload, account isolation, view conflicts, authorization and history behavior receive focused unit/API/browser checks, followed by existing CI and shared workspace QA.

Rollback is a code revert. Older app versions do not understand sorted view definitions; retain an updated build until these definitions are replaced with default-order views if rolling back. No task-time baseline or customer UAT claim.

## Previous package

PR #354 was merged to main as `df4c7525d68460d57efbf500c88c4ab4563aa908`. Its branch head `44648f80956af5b507cd244832cdf6fffd84932a` passed CI and the complete browser workflow, including 21 experience checks, core lifecycle coverage, accessibility scanners and 324 menu/language/theme/width combinations. GitHub's tested PR merge ref had no file differences against that head. Merge does not by itself verify the live production revision.
