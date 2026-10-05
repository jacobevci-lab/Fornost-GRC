# Model linked alerts and findings

Model cards provide a collapsed linked-work panel. Opening it independently loads alerts and findings scoped to the exact model ID. Each source has its own retry, loading and error state; a failed source never appears as an empty list and does not hide the successful source. Record titles open the existing native record view. Five records per source are displayed per page.

GET `/api/ai/assurance-alerts?modelId=...` and `/api/ai/findings?modelId=...` accept one nonempty, unpadded model ID of at most 100 characters without control characters. Existing role checks remain unchanged. SQL filters before the 500-record cap; with `id`, both predicates must match. Unknown parents return no records, without global fallback. CSV exports respect the same filter. At 500 results the panel discloses the bound, not an unbounded total. Existing severity ordering is retained; resolved records are included.

No schema migration. This panel covers native alerts and findings, not every model relation. Source refresh is explicit; opening again refreshes both sources. Unit tests exercise exact parent isolation, filtering before the cap, combined predicates and malformed IDs. The retirement browser QA exercises actual APIs, independent source failure/recovery and native alert navigation.

## Action status

The panel starts with open actions and offers Closed actions / All records independently for alerts and findings. Filters load from the API, reset pagination and discard previous requests on selection changes. Resolved alerts are closed; resolved or dismissed findings are closed. Acknowledged/escalated alerts and findings awaiting verification remain open.

Both endpoints accept optional `workState=all|open|closed` (default `all` for existing consumers). Invalid, empty and repeated values return 400. Status, model and record predicates are intersected before the 500-record limit, including CSV exports. Counts describe only the selected bounded view. No schema changes.
