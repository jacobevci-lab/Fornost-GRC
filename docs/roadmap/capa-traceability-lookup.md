# Exact CAPA lifecycle lookup

The attention view previously fetched the most recent 500 completed CAPA promotions independently of its work records. An older displayed work item could therefore look unresolved even when its canonical CAPA still existed.

The traceability endpoint now accepts a validated `workIds` JSON query containing up to 50 unique IDs. Bound SQL parameters retain the authenticated, completed-promotion constraints and resolve only those work records. The legacy unfiltered endpoint retains its 500-row response limit, adds deterministic tie ordering and uses a 501st sentinel to report coverage honestly.

The attention loader requests its completed work records in batches of 50, with at most 500 displayed records and a 20-second timeout per concurrent request. It checks completeness, duplicate identities, work/finding/result correspondence and canonical lifecycle fields before publishing the combined result. An explicit null canonical finding means a broken link; missing or contradictory response rows mean the lifecycle could not be read. Snapshots are indexed by work ID, avoiding accidental reuse across different promotions.

Validation includes SQLite fixtures beyond the 500-row boundary, exact and missing links, SQL parameter isolation, invalid query inputs and client batch/response contracts. Isolated browser QA checks authentication, malformed query rejection, 51-record batching, foreign/missing/incomplete response handling and recovery.

Scope: this improves lifecycle resolution for loaded work items. It does not expand the attention view's work register or create a transactional snapshot across batches. Existing workflow mutations and independent approvals are unchanged.
