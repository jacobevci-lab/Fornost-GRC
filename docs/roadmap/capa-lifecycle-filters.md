# CAPA lifecycle drill-down

Summary cards now open the records counted by each KPI. Selecting a card clears text search and contextual focus, resets pagination and selects its server-side filter. Global summary counts and the full-register CSV remain unfiltered.

The register adds all active CAPA, not started, in progress, critical excluding closed, recurring across all statuses and expired risk acceptance filters. Existing search combines with the selected filter. Accepted risk is excluded from active CAPA; critical accepted risk remains in the critical KPI; expiry occurs after the UTC acceptance date, not during it. Recurring includes closed records, consistent with the existing summary.

SQLite regression verifies KPI/count agreement, lifecycle boundaries, expiry-day behavior and combined searches. Browser regression covers clearing search, selected-card state and pagination reset.

Assignment filters select exact owner or reviewer identity from the authenticated API session, combine with search/status and paginate across the full register. Summary cards clear assignment scope to preserve global count agreement. These filters do not grant additional record or workflow permissions.

The lineage panel now receives the selected canonical finding directly. It no longer parses rendered titles, observes the document or reloads a separate 3,000-row register. Links close the modal before navigating. Completeness explicitly describes field presence rather than verified links/evidence, and identical owner/reviewer identities do not count as independent review.
