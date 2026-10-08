# Assurance queue continuation

The work queue can continue beyond 500 records. Each API request reads at most 501 rows, returns 500, and uses the extra row only to determine whether a continuation exists. The client retains its 25-card rendering budget and offers **Load next records** separately from **Show more**.

Continuation follows the existing priority, descending update timestamp, and ascending unique ID order. SQL parameters bind all cursor values; malformed or oversized cursors return HTTP 400. Legacy schema fallbacks use the same ordering and continuation predicate.

The UI validates every page before appending it. A repeated identity, mismatched continuation, failed request, or invalid response blocks queue actions and metrics until Refresh succeeds. Successful review writes also refresh from the first page. No automatic loop downloads the whole register.

Search and filters still cover **loaded records**, explicitly labelled while the queue is partial. Summary and SLA metrics remain unavailable until the last page is loaded. This is a live traversal, not a transactionally frozen export: concurrent edits can move a record before the cursor. Refresh starts a new traversal; duplicate records are rejected rather than silently overwritten. Server-wide search is available through the explicit Search all records action; snapshot-consistent aggregates remain follow-up work.

Validation includes a real SQLite traversal of 1,203 rows across status priorities and tied timestamps; schema fallback continuation; literal SQL-bound cursor values; malformed cursor and response rejection; browser search of a record beyond 500; 25-card rendering after append; duplicate/outage recovery; and independent-review protections.
