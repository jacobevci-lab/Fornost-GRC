# Assurance queue coverage and response integrity

The bounded assurance endpoint previously returned at most 500 rows without saying whether more work existed. Its summary and the client's SLA metrics could therefore look complete while only describing a subset.

The register now reads one sentinel beyond the 500-row response budget and returns explicit `coverage.loaded` and `coverage.complete`. Exactly 500 rows are distinguished from 501 or more in the same query. A deterministic ID tie-breaker stabilizes equal timestamps, and the legacy no-join fallback retains active-work priority.

The workspace displays a partial-queue notice and withholds overall counters and operational metrics when the response is incomplete. Search and filters are explicitly described as applying only to the loaded rows. Individual loaded records remain reviewable through the existing permission and independent-review checks. Older responses without coverage are conservatively partial at the cap.

The response validator rejects duplicate/blank identities, negative/fractional/unsafe counters, mismatched totals and inconsistent coverage. Rejected responses use the existing recovery state with review actions disabled until a valid refresh.

Validation: SQLite fixtures cover empty, exactly 500 and 501+ results, stable ties and the legacy fallback. Unit tests cover corrupt responses and backward compatibility. Browser QA covers partial counters, duplicate-identity rejection and recovery to an explicitly complete 500-row response, alongside the existing SLA and independent-review scenarios.

Follow-up: cursor continuation now provides access beyond the per-response budget; see [pagination](assurance-queue-pagination.md). Server-wide search is available through Search all records; see [search](assurance-queue-search.md). No permission expansion is required.
