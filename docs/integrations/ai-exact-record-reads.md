# Native AI record reads

`GET /api/ai/models?id=<native-id>`, `GET /api/ai/assurance-alerts?id=<native-id>`
and `GET /api/ai/findings?id=<native-id>` retrieve one exact record independently
of the general list's 500-record cap. Native model/alert/finding views use this
parameter when opened from Connected GRC or a related-record link.

The existing authorization checks and response collection shapes are preserved.
An unknown ID returns an empty collection after authorization; no
other record is substituted. Repeated, empty, padded, control-character or over
100-character IDs return 400. SQL binds the ID as a value.

Summary counters describe the returned collection, so exact views count only the
selected record. The native CSV button still exports the general bounded list.
An explicit API request combining `id` and `format=csv` exports that exact record.
Showing all records reloads the general list. This does not add full server-side
pagination or remove the bounded-list/export limit.
