# GRC data-boundary correction — 2026-11-04

An operator using external AI must not share a record above the provider's data
ceiling, and a Viewer listing records must not insert sample business data or
delete legacy records. The November 4 review reproduced both failures on main
`06535019` with synthetic records. This delivery fixes those two boundaries.

## Acceptance

- Resolve known TR/EN classification labels at the shared AI policy boundary.
  Unknown or malformed explicit labels are excluded. If multiple classification
  fields exist, each must permit sharing; no lower alias can mask a higher one.
  Records with no classification fields retain the documented Internal default.
- Apply the same rule to core-record context, evidence lineage and approved
  knowledge; preserve the strictest provider/fallback ceiling.
- GRC listing never seeds, compacts, deletes or allocates business record codes.
  Existing saved codes remain stable; legacy uncoded records display their ID.
  Write-time allocation reserves both saved codes and legacy numeric IDs,
  case-insensitively, so a new record cannot make an existing reference ambiguous.
  The existing explicit Admin sample restore/remove workflow remains available.
- Exercise real context functions and route SQL with synthetic SQLite fixtures:
  TR/EN/case/unknown/conflicting labels; empty and legacy installations; Viewer,
  pagination, deleted/edited samples and Admin restore/remove idempotence.

No live data migration, cleanup, UI redesign or provider call is required. Schema
compatibility for old installations remains; the read-only guarantee concerns
business data. Existing records and localized catalog labels are not rewritten.
Release requires applicable repository checks on the candidate. Rolling back the
code reintroduces the two unsafe paths and is not the preferred recovery; no data
rollback is needed for this change. Full live QA remains a separate release gate.

## Focused verification

- Twelve new boundary tests plus fifty nearby regression tests pass (62 total).
- The initial eleven boundary tests were also run against untouched `06535019`
  in a disposable worktree: all eleven failed, then passed on the patch.
- Review identified a legacy numeric-ID/code collision caused by removing the
  read-time backfill. A real GET → create → evidence-reference regression first
  reproduced it, then passed after reserving legacy IDs during writes.
- No external AI call or customer data was used. These tests execute actual
  context builders and route SQL with synthetic D1 adapters / SQLite, not a
  customer browser session. Repository CI and live release checks are recorded
  separately on the pull request and release revision.
- The first isolated browser run exposed a QA setup dependency on automatic
  `BIA-001` seeding (`REFERENCE_UNAVAILABLE` during continuity plan creation).
  Local browser workflows now explicitly restore samples through the Admin API
  with an ephemeral local session. Production behavior remains free of read-time
  seeding; the fixture helper is hardcoded to the loopback test server.
