# Record-linked AI activity history

Admin users can expand Activity history on native model, assurance alert and
finding cards. It is loaded on demand, shows the latest 50 linked events, and
provides refresh, loading, failure/retry and empty states. Closing/reopening
refreshes the view; a new record revision resets it. Existing dark/light themes
and compact typography are retained. Finding Editors/Viewers do not receive this
Admin-only control, and the server continues to require Admin access.

GET `/api/ai/audit?id=<record-id>&limit=50` scopes the existing audit endpoint.
IDs use the same strict validation as exact record navigation: duplicate, blank,
padded, control-character or overlong IDs are rejected. Without id the existing
general activity list remains available. Filtering happens in SQL before LIMIT,
using exact string membership in the context-reference JSON array, never substring
search. Invalid JSON is ignored for matching. Older model-inventory events are
included only for known inventory actions whose detail begins with the complete
ID followed by a space. No other free-text association is inferred.

Responses retain logs and add hasMore. A single extra row detects truncation;
ordering is created_at descending then event ID descending. Unknown IDs return
an empty scoped history, never a fallback to global events. A model's history can
include linked findings/alarms because their authoritative context lists include
the model ID. Old events without an exact reference or recognized inventory
prefix may be absent. This panel is a bounded view, not an exhaustive export.

The history is read-only and does not itself create audit events. It reports
existing recorded events; it does not invent an event for a failed transaction
that rolled back. SQL tests cover prefix collisions, malformed references,
legacy matching and limit ordering. Isolated browser/API QA covers all three
cards, error recovery and light/dark responsive layout bounds. No migration.
