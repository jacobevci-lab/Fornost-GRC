# CAPA lifecycle drill-down

Summary cards now open the records counted by each KPI. Selecting a card clears text search and contextual focus, resets pagination and selects its server-side filter. Global summary counts and the full-register CSV remain unfiltered.

The register adds all active CAPA, not started, in progress, critical excluding closed, recurring across all statuses and expired risk acceptance filters. Existing search combines with the selected filter. Accepted risk is excluded from active CAPA; critical accepted risk remains in the critical KPI; expiry occurs after the UTC acceptance date, not during it. Recurring includes closed records, consistent with the existing summary.

SQLite regression verifies KPI/count agreement, lifecycle boundaries, expiry-day behavior and combined searches. Browser regression covers clearing search, selected-card state and pagination reset.
