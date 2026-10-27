# Continuity work in My Work — 27 October 2026

## Product decision

Plan owners, crisis leads, exercise facilitators and independent reviewers need to find their continuity responsibilities alongside existing audit, policy and regulatory work. Main `b13b4b7dc694736b6f23dcdde30ece85bce2f75e` has authoritative continuity records and exact navigation, but `enterpriseWorkSources` does not load them. This delivery connects those existing records to My Work. Task completion time and adoption are unmeasured. External auditor grants, background recurrence and new business modules remain separate priorities.

## Journey and boundaries

My Work → Continuity module filter → assigned plan, exercise or improvement gap → exact canonical record → existing authorized action → refresh My Work. Draft plan approval belongs to the independent reviewer; approved plans still need activation by the owner/crisis lead or Admin. Only active plans use the saved review date; exercise and gap dates come from their sources. No approval deadline or gap submission stage is invented. Completed/cancelled exercises, retired plans and closed gaps leave active work; the recent-completion view uses actual terminal timestamps, never creation time.

Use a bounded, metadata-only read through the existing continuity authorization. Full-access readers may read it; scoped accounts retain the existing denial. Do not return evidence files, pins or event details. Missing parents, malformed data, ambiguous identities, failed sources and exceeded bounds remain explicit incomplete states with export disabled. Failed enterprise sources are removed from the loaded queue until recovery so retained tasks cannot imply current access. No record mutation, new menu, email option, palette change or schema migration is required.

## Acceptance and validation

- Exact assignment matching, lifecycle-specific ownership and source dates drive Mine/Organization, overdue/waiting/completed filters, saved views and CSV.
- All three record kinds open the exact authorized source, including older targets outside default list ordering; existing missing/error recovery remains usable.
- Cancelled work never remains open. Terminal timestamps are used only when valid; legacy missing timestamps do not become recent completions.
- Bounded SQLite reads omit narratives/evidence/history, disclose incomplete coverage and do not modify canonical rows. Direct unauthorized requests remain denied.
- Chromium verifies the connected journey and source recovery, TR/EN, desktop/mobile and both existing themes. Unit/route regressions, lint, build and required CI must pass on the published revision.

## Delivery record

Implemented. Focused projection and actual SQLite route tests passed, including exact-size/overflow bounds, metadata-only reads, terminal event timestamps and no-write checks; typecheck and migration/artifact validation passed. Full regression, lint and connected Chromium validation are in progress. Exact revision and test evidence will be recorded in the delivery PR. Documentation must describe assignments, dates, bounds and recovery. Rollback is a code revert; original records and historical decisions remain intact. Main merge, production deployment and customer UAT are separate stages. Browser fixtures must be isolated and cleaned up.
