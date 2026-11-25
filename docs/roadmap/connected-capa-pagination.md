# Revision-consistent CAPA graph loading

Connected GRC now reads the canonical findings register through `GET /api/findings?view=graph`, using 500-record keyset pages and the existing transactional revision triggers. Admin, Editor and Viewer retain their existing read access; the report/export endpoint remains Admin-only. Graph responses explicitly project only graph-consumed fields, without report evidence hashes or unrelated narrative.

All pages belong to one revision. Insert/update/delete between pages causes HTTP 409 and discards that source, while other graph sources remain usable. The source status asks the user to refresh. A false total, duplicate identity, non-progressing cursor or changed revision also cannot produce complete coverage.

The browser loads up to 10,000 findings and approximately 16 MiB of projected UTF-16 JSON, within the existing 15-second overall source deadline. Valid completed pages at a record/memory budget are shown as partial. A timeout/conflict discards the findings source entirely. Exactly 3,000 records and larger complete snapshots no longer inherit the legacy cutoff. Other enterprise sources retain their explicit partial-data behavior.

Validation: SQLite-backed 3,501-record traversal, 10,001-record budget, concurrent mutation, cursor/total/revision failures; source conflict isolation and recovery; browser traversal and search of the second page. This is a per-source consistent snapshot, not an atomic snapshot across all modules. Background graph jobs and larger datasets remain future work.
