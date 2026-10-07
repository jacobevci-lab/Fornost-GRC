# CAPA register integrity — 7 October 2026

This increment connects the Findings workspace to complete reporting and record-specific evidence history without introducing a new module or mutation path.

- Canonical status counts and the bounded list are read in one database transaction. Counts include records beyond the 3,000-row UI limit. The UI distinguishes full-register counts from list search/filter scope.
- All CAPA CSV uses the existing Admin-only, revision-consistent report pages. It exports all loaded canonical records, including detailed risk/control and evidence fields, and explicitly excludes screen search/status filters. Partial or changed reports cannot download. Existing browser budgets remain 100,000 rows, about 32 MiB and 120 seconds; this is not an unlimited server export.
- The legacy direct CSV endpoint rejects a truncated dataset with 409 instead of silently returning the first 3,000 rows. Small legacy exports preserve their existing format and audit event.
- Each finding detail has its own paginated read-only history. Pages use descending timestamp/ID keysets, preserve timestamp ties and expose actor, state changes, decision details, evidence references and hashes. New events become visible on refresh. Other finding events cannot enter the query. Existing Admin/Editor/Viewer access applies.
- History load failures and retry are explicit. Requests are aborted on close or finding changes. CAPA exports are aborted on workspace unmount. No workflow decision is retried automatically.

Validation covers database-backed counts beyond 3,000, empty counts, expired acceptances, 121 history events with identical timestamps, concurrent newer events, finding isolation and invalid/missing cursors. Existing 3,501-record report tests cover full export loading and revision conflicts. Browser QA extends history recovery/paging and all-record CSV while screen search is active; runtime lifecycle QA checks the real history endpoint and verification evidence.

Remaining boundary: register search itself still searches the bounded 3,000-row list. Server-side register search and very large server export jobs remain follow-up work.
