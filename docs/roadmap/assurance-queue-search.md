# Assurance server search

The search field continues to filter loaded records immediately. **Search all records** also queries the server before the 500-row response limit is applied. Results can be continued with the same query and language. **Clear search** restores the unfiltered queue. A visible notice identifies the submitted server query and scopes counters/SLA metrics to those results. Status tabs still filter the loaded result set.

Search includes work, finding and rule IDs, finding title and owner, rule name, mapped controls, selected target control, and canonical CAPA code. Turkish letter folding mirrors the existing Findings register; `instr` with a bound parameter treats percent, underscore and SQL-looking text literally. Inputs are bounded to 200 characters, supported locales and no control characters.

Search requests do not fall back to a reduced schema: missing joined sources produce an error rather than falsely claiming zero matches. The browser checks the server's echoed query and locale before accepting search results. Existing cancellation, independent-review permissions and failed-load blocking remain in force.

This is live search, not a frozen export. Loading more results does not provide snapshot consistency under concurrent edits. Search and status-filter counts must not be interpreted as organization-wide totals.
